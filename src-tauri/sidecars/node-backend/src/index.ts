/**
 * Node Backend Server
 *
 * Handles AI SDK streaming and tool execution.
 * Runs as a Tauri sidecar, communicating via HTTP.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamText, generateText, tool, type CoreTool, type LanguageModelV1 } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { ollama, createOllama } from "ollama-ai-provider";
import { z, type ZodTypeAny } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Anthropic from "@anthropic-ai/sdk";
import * as os from "os";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

// =============================================================================
// Agent Session & Task Management
// =============================================================================

/**
 * Task status for agent orchestration
 */
type AgentTaskStatus = "staged" | "in_progress" | "done" | "cancelled";

/**
 * Task type for categorization
 */
type AgentTaskType = "plan" | "explore" | "execute";

/**
 * A task tracked during agent orchestration
 */
interface AgentTask {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  result?: unknown;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Session status for orchestration pipeline
 */
type AgentSessionStatus = "planning" | "exploring" | "executing" | "waiting_user" | "complete" | "error";

/**
 * An agent session for a thread
 */
interface AgentSession {
  id: string;
  threadId: string;
  status: AgentSessionStatus;
  tasks: Map<string, AgentTask>;
  planContent?: string;
  error?: string;
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * WebSocket update message types
 */
interface WSUpdateBase {
  sessionId: string;
  threadId: string;
}

interface WSSessionUpdate extends WSUpdateBase {
  type: "session_created" | "session_updated" | "session_complete" | "session_error";
  session: {
    id: string;
    status: AgentSessionStatus;
    error?: string;
  };
}

interface WSTaskUpdate extends WSUpdateBase {
  type: "task_created" | "task_updated";
  task: AgentTask;
}

interface WSExploreUpdate extends WSUpdateBase {
  type: "explore_started" | "explore_complete";
  count?: number;
  prompts?: string[];
  results?: string[];
}

interface WSSubAgentUpdate extends WSUpdateBase {
  type: "sub_agent_started" | "sub_agent_done" | "sub_executor_started" | "sub_executor_done";
  index: number;
  prompt?: string;
  taskIds?: string[];
  summary?: string;
  success?: boolean;
}

interface WSToolCallUpdate extends WSUpdateBase {
  type: "tool_call" | "tool_result";
  toolCall: {
    id: string;
    toolName: string;
    status: "calling" | "done";
    args?: Record<string, unknown>;
    result?: string;
  };
}

type WSUpdate = WSSessionUpdate | WSTaskUpdate | WSExploreUpdate | WSSubAgentUpdate | WSToolCallUpdate;

// In-memory stores for agent sessions
const agentSessions = new Map<string, AgentSession>();
const sessionsByThread = new Map<string, string>(); // threadId -> sessionId

// WebSocket clients by threadId
const wsClientsByThread = new Map<string, Set<WebSocket>>();

/**
 * Create a new agent session for a thread
 */
function createAgentSession(threadId: string): AgentSession {
  // Clean up any existing session for this thread
  const existingSessionId = sessionsByThread.get(threadId);
  if (existingSessionId) {
    agentSessions.delete(existingSessionId);
  }

  const session: AgentSession = {
    id: randomUUID(),
    threadId,
    status: "planning",
    tasks: new Map(),
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };

  agentSessions.set(session.id, session);
  sessionsByThread.set(threadId, session.id);

  // Broadcast session creation
  broadcastToThread(threadId, {
    type: "session_created",
    sessionId: session.id,
    threadId,
    session: { id: session.id, status: session.status },
  });

  return session;
}

/**
 * Get session by thread ID
 */
function getSessionByThread(threadId: string): AgentSession | undefined {
  const sessionId = sessionsByThread.get(threadId);
  return sessionId ? agentSessions.get(sessionId) : undefined;
}

/**
 * Update session status
 */
function updateSessionStatus(sessionId: string, status: AgentSessionStatus, error?: string): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  session.status = status;
  session.lastActivityAt = new Date();
  if (error) session.error = error;

  const updateType = status === "complete" ? "session_complete" :
                     status === "error" ? "session_error" : "session_updated";

  broadcastToThread(session.threadId, {
    type: updateType,
    sessionId,
    threadId: session.threadId,
    session: { id: session.id, status, error },
  });
}

/**
 * Add a task to a session
 */
function addTaskToSession(
  sessionId: string,
  title: string,
  description: string,
  type: AgentTaskType
): AgentTask {
  const session = agentSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const task: AgentTask = {
    id: randomUUID(),
    sessionId,
    title,
    description,
    type,
    status: "staged",
    createdAt: new Date(),
  };

  session.tasks.set(task.id, task);
  session.lastActivityAt = new Date();

  broadcastToThread(session.threadId, {
    type: "task_created",
    sessionId,
    threadId: session.threadId,
    task,
  });

  return task;
}

/**
 * Update a task's status
 */
function updateTaskStatus(
  sessionId: string,
  taskId: string,
  status: AgentTaskStatus,
  result?: unknown
): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  const task = session.tasks.get(taskId);
  if (!task) return;

  task.status = status;
  if (result !== undefined) task.result = result;

  if (status === "in_progress" && !task.startedAt) {
    task.startedAt = new Date();
  }
  if (status === "done" || status === "cancelled") {
    task.completedAt = new Date();
  }

  session.lastActivityAt = new Date();

  broadcastToThread(session.threadId, {
    type: "task_updated",
    sessionId,
    threadId: session.threadId,
    task,
  });
}

/**
 * Get all tasks for a session
 */
function getSessionTasks(sessionId: string): AgentTask[] {
  const session = agentSessions.get(sessionId);
  return session ? Array.from(session.tasks.values()) : [];
}

/**
 * Clear completed/cancelled tasks from a session
 */
function clearCompletedTasks(sessionId: string): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  for (const [taskId, task] of session.tasks) {
    if (task.status === "done" || task.status === "cancelled") {
      session.tasks.delete(taskId);
    }
  }
}

/**
 * Broadcast an update to all WebSocket clients watching a thread
 */
function broadcastToThread(threadId: string, update: WSUpdate): void {
  const clients = wsClientsByThread.get(threadId);
  if (!clients) return;

  const message = JSON.stringify(update);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// =============================================================================
// WebSocket Server
// =============================================================================

const wsPort = parseInt(process.env.WS_PORT ?? "3002", 10);
const wss = new WebSocketServer({ port: wsPort });

wss.on("connection", (ws, req) => {
  // Parse threadId from URL query params
  const url = new URL(req.url ?? "", `http://localhost:${wsPort}`);
  const threadId = url.searchParams.get("threadId");

  if (!threadId) {
    ws.close(1008, "threadId required");
    return;
  }

  console.log(`[WS] Client connected for thread: ${threadId}`);

  // Add to clients map
  if (!wsClientsByThread.has(threadId)) {
    wsClientsByThread.set(threadId, new Set());
  }
  wsClientsByThread.get(threadId)!.add(ws);

  // Send current session state if exists
  const session = getSessionByThread(threadId);
  if (session) {
    ws.send(JSON.stringify({
      type: "session_updated",
      sessionId: session.id,
      threadId,
      session: { id: session.id, status: session.status, error: session.error },
    }));

    // Send all tasks
    for (const task of session.tasks.values()) {
      ws.send(JSON.stringify({
        type: "task_updated",
        sessionId: session.id,
        threadId,
        task,
      }));
    }
  }

  ws.on("close", () => {
    console.log(`[WS] Client disconnected for thread: ${threadId}`);
    wsClientsByThread.get(threadId)?.delete(ws);
    if (wsClientsByThread.get(threadId)?.size === 0) {
      wsClientsByThread.delete(threadId);
    }
  });

  ws.on("error", (err) => {
    console.error(`[WS] Error for thread ${threadId}:`, err);
  });
});

console.log(`WebSocket server starting on port ${wsPort}...`);

// =============================================================================
// MCP Server Management
// =============================================================================

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: Map<string, { description: string; inputSchema: Record<string, unknown> }>;
}

const mcpConnections = new Map<string, MCPConnection>();

/**
 * Convert JSON Schema to Zod schema
 */
function jsonSchemaToZod(schema: Record<string, unknown>): ZodTypeAny {
  const type = schema.type as string;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[]) ?? [];
  const items = schema.items as Record<string, unknown> | undefined;
  const enumValues = schema.enum as unknown[] | undefined;

  if (enumValues) {
    return z.enum(enumValues as [string, ...string[]]);
  }

  switch (type) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      if (items) {
        return z.array(jsonSchemaToZod(items));
      }
      return z.array(z.unknown());
    case "object":
      if (properties) {
        const shape: Record<string, ZodTypeAny> = {};
        for (const [key, propSchema] of Object.entries(properties)) {
          const zodProp = jsonSchemaToZod(propSchema);
          shape[key] = required.includes(key) ? zodProp : zodProp.optional();
        }
        return z.object(shape);
      }
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

/**
 * Connect to an MCP server
 */
async function connectMCPServer(config: MCPServerConfig): Promise<MCPConnection | null> {
  try {
    console.log(`Connecting to MCP server: ${config.name}`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as Record<string, string>,
    });

    const client = new Client({
      name: "aios-chat",
      version: "0.1.0",
    }, {
      capabilities: {},
    });

    await client.connect(transport);

    // Get available tools
    const toolsResult = await client.listTools();
    const tools = new Map<string, { description: string; inputSchema: Record<string, unknown> }>();

    for (const mcpTool of toolsResult.tools) {
      tools.set(mcpTool.name, {
        description: mcpTool.description ?? "",
        inputSchema: mcpTool.inputSchema as Record<string, unknown>,
      });
    }

    console.log(`Connected to ${config.name}, tools: ${Array.from(tools.keys()).join(", ")}`);

    return { client, transport, tools };
  } catch (error) {
    console.error(`Failed to connect to MCP server ${config.name}:`, error);
    return null;
  }
}

/**
 * Initialize all MCP servers
 */
async function initializeMCPServers(): Promise<void> {
  const homeDir = os.homedir();

  const servers: MCPServerConfig[] = [
    // Filesystem server (TypeScript/npm) - allow access to home directory by default
    {
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", homeDir],
    },
    // Fetch server (Python) - for fetching web content
    {
      name: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
    },
    // Time server (Python) - for time-related operations
    {
      name: "time",
      command: "uvx",
      args: ["mcp-server-time"],
    },
  ];

  // Connect to servers in parallel
  const results = await Promise.allSettled(
    servers.map(async (config) => {
      const connection = await connectMCPServer(config);
      if (connection) {
        mcpConnections.set(config.name, connection);
      }
      return { name: config.name, connected: !!connection };
    })
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("MCP server initialization failed:", result.reason);
    }
  }
}

/**
 * Email MCP server configuration
 * Connected dynamically when email credentials are provided
 */
interface EmailConfig {
  address: string;
  username?: string;
  password: string;
  imapHost?: string;
  imapPort?: string;
  imapSecurity?: string; // "ssl" (default), "starttls", or "none"
  smtpHost?: string;
  smtpPort?: string;
  smtpSecurity?: string; // "ssl" (default), "starttls", or "none"
  sslVerify?: string;
}

let emailMCPConnected = false;
let lastEmailConfig: EmailConfig | null = null;

/**
 * Connect to email MCP server if credentials are provided
 * Only reconnects if credentials have changed
 */
async function connectEmailMCPIfNeeded(emailConfig: EmailConfig | undefined): Promise<void> {
  if (!emailConfig?.address || !emailConfig?.password) {
    return;
  }

  // Check if we need to reconnect (first time or credentials changed)
  const configChanged = !lastEmailConfig ||
    lastEmailConfig.address !== emailConfig.address ||
    lastEmailConfig.username !== emailConfig.username ||
    lastEmailConfig.password !== emailConfig.password ||
    lastEmailConfig.imapHost !== emailConfig.imapHost ||
    lastEmailConfig.imapPort !== emailConfig.imapPort ||
    lastEmailConfig.imapSecurity !== emailConfig.imapSecurity ||
    lastEmailConfig.smtpHost !== emailConfig.smtpHost ||
    lastEmailConfig.smtpPort !== emailConfig.smtpPort ||
    lastEmailConfig.smtpSecurity !== emailConfig.smtpSecurity ||
    lastEmailConfig.sslVerify !== emailConfig.sslVerify;

  if (emailMCPConnected && !configChanged) {
    return;
  }

  // Disconnect existing email server if connected
  if (emailMCPConnected && mcpConnections.has("email")) {
    try {
      const connection = mcpConnections.get("email");
      if (connection) {
        await connection.transport.close();
        mcpConnections.delete("email");
      }
    } catch (error) {
      console.error("Error disconnecting email MCP server:", error);
    }
    emailMCPConnected = false;
  }

  // Build environment variables for @anonx3247/email-mcp
  const env: Record<string, string> = {
    EMAIL_ADDRESS: emailConfig.address,
    EMAIL_USERNAME: emailConfig.username || emailConfig.address,
    EMAIL_PASSWORD: emailConfig.password,
  };

  if (emailConfig.imapHost) {
    env.IMAP_HOST = emailConfig.imapHost;
  }
  if (emailConfig.imapPort) {
    env.IMAP_PORT = emailConfig.imapPort;
  }
  if (emailConfig.imapSecurity) {
    env.IMAP_SECURITY = emailConfig.imapSecurity;
  }
  if (emailConfig.smtpHost) {
    env.SMTP_HOST = emailConfig.smtpHost;
  }
  if (emailConfig.smtpPort) {
    env.SMTP_PORT = emailConfig.smtpPort;
  }
  if (emailConfig.smtpSecurity) {
    env.SMTP_SECURITY = emailConfig.smtpSecurity;
  }
  if (emailConfig.sslVerify === "false") {
    env.SSL_VERIFY = "false";
  }

  const emailServerConfig: MCPServerConfig = {
    name: "email",
    command: "npx",
    args: ["email-mcp"],
    env,
  };

  console.log(`Connecting to email MCP server for ${emailConfig.address}...`);
  console.log("Email MCP env:", JSON.stringify(Object.fromEntries(Object.entries(env).map(([k, v]) => [k, k.includes("PASSWORD") ? "***" : v]))));
  const connection = await connectMCPServer(emailServerConfig);
  if (connection) {
    mcpConnections.set("email", connection);
    emailMCPConnected = true;
    lastEmailConfig = { ...emailConfig };
    console.log(`Email MCP server connected with ${connection.tools.size} tools`);
  } else {
    console.error("Failed to connect email MCP server");
  }
}

/**
 * Max size for tool results to prevent context overflow
 * ~8k chars ≈ 4k tokens per result
 * With up to 10 tool calls, that's ~40k tokens max for tool results
 */
const MAX_TOOL_RESULT_CHARS = 8000;

/**
 * Truncate a tool result to prevent context overflow
 * Returns a STRING to ensure consistent size
 */
function truncateToolResultForContext(result: unknown): string {
  if (result === null || result === undefined) {
    return String(result);
  }

  const resultStr = typeof result === "string" ? result : JSON.stringify(result);

  if (resultStr.length <= MAX_TOOL_RESULT_CHARS) {
    console.log(`[Tools] Result OK: ${resultStr.length} chars`);
    return resultStr;
  }

  console.log(`[Tools] TRUNCATING: ${resultStr.length} chars -> ${MAX_TOOL_RESULT_CHARS} chars`);

  // Simple and reliable: take first portion + notice + last portion
  const notice = "\n\n[... content truncated: was " + resultStr.length + " chars ...]\n\n";
  const availableChars = MAX_TOOL_RESULT_CHARS - notice.length;
  const firstPartSize = Math.floor(availableChars * 0.7); // 70% for beginning
  const lastPartSize = availableChars - firstPartSize;    // 30% for end

  const firstPart = resultStr.slice(0, firstPartSize);
  const lastPart = resultStr.slice(-lastPartSize);

  const truncated = firstPart + notice + lastPart;
  console.log(`[Tools] Truncated result size: ${truncated.length} chars`);
  return truncated;
}

/**
 * Convert MCP tools to AI SDK tools
 */
function getMCPToolsForAISDK(): Record<string, CoreTool> {
  const aiTools: Record<string, CoreTool> = {};

  for (const [serverName, connection] of mcpConnections) {
    for (const [toolName, toolInfo] of connection.tools) {
      // Prefix tool name with server name to avoid conflicts
      const fullToolName = `${serverName}_${toolName}`;

      aiTools[fullToolName] = tool({
        description: toolInfo.description,
        parameters: jsonSchemaToZod(toolInfo.inputSchema),
        execute: async (args) => {
          try {
            const result = await connection.client.callTool({
              name: toolName,
              arguments: args as Record<string, unknown>,
            });
            // Truncate large results to prevent context overflow
            return truncateToolResultForContext(result.content);
          } catch (error) {
            return { error: String(error) };
          }
        },
      });
    }
  }

  return aiTools;
}

/**
 * Cleanup MCP connections on shutdown
 */
async function cleanupMCPServers(): Promise<void> {
  for (const [name, connection] of mcpConnections) {
    try {
      await connection.transport.close();
      console.log(`Disconnected from MCP server: ${name}`);
    } catch (error) {
      console.error(`Error disconnecting from ${name}:`, error);
    }
  }
  mcpConnections.clear();
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  wss.close();
  await cleanupMCPServers();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  wss.close();
  await cleanupMCPServers();
  process.exit(0);
});

// =============================================================================
// System Prompt
// =============================================================================

function generateSystemPrompt(hasPerplexity: boolean, hasMCPTools: boolean): string {
  let prompt = `You are AIOS, an AI assistant with access to tools for enhanced interaction.

## Available Tools

### User Interaction
- **ask_user**: Ask the user questions when you need input to proceed
  - Use "confirm" for yes/no questions
  - Use "single_select" for choosing one option from a list
  - Use "multi_select" for choosing multiple options
  - Use "text" for free-form text input
  - Provide clear, concise questions with helpful option descriptions

- **configure_settings**: Request user to configure settings inline
  - Use when you need API keys, email credentials, or other config before proceeding
  - Settings keys: "email", "perplexity", "anthropic", "ollama"
  - A form will appear inline in the chat for the user to fill out
  - After user saves settings, retry the original operation

### Content Embedding
- **embed**: Display rich media inline in the chat
  - YouTube videos (youtube.com, youtu.be)
  - Spotify tracks/playlists/albums (open.spotify.com)
  - Google Maps locations and directions (google.com/maps)
  - Social media posts (Twitter/X, Instagram, TikTok, Facebook, LinkedIn)
  - Use when sharing relevant videos, music, maps, or social content

### Multi-Agent Orchestration
- **complex**: Delegate complex tasks to the multi-agent system
  - Use when a task requires multiple steps, research, or parallel work
  - A planning agent will analyze, gather information, and execute
  - Progress will be shown in a task panel on the side
  - Best for: refactoring, research projects, multi-file changes, complex implementations
  - NOT for: simple questions, single edits, quick clarifications`;

  if (hasPerplexity) {
    prompt += `

### Web Search (Perplexity)
- **perplexity_ask**: Quick searches and current information
- **perplexity_research**: In-depth research on complex topics with citations
- **perplexity_reason**: Logical analysis and step-by-step reasoning

When presenting search results, format citations as markdown links: [Source Title](url)`;
  }

  if (hasMCPTools) {
    prompt += `

### Filesystem Operations (filesystem_*)
- **filesystem_read_file**: Read a file (auto-detects text/binary)
- **filesystem_read_text_file**: Read a text file with encoding options
- **filesystem_read_media_file**: Read media files (images, PDFs) as base64
- **filesystem_read_multiple_files**: Read multiple files at once
- **filesystem_write_file**: Write content to a file
- **filesystem_edit_file**: Edit a file using search/replace
- **filesystem_create_directory**: Create a new directory
- **filesystem_list_directory**: List contents of a directory
- **filesystem_list_directory_with_sizes**: List directory with file sizes
- **filesystem_directory_tree**: Get a tree view of a directory
- **filesystem_move_file**: Move or rename a file
- **filesystem_search_files**: Search for files by pattern
- **filesystem_get_file_info**: Get metadata about a file
- **filesystem_list_allowed_directories**: List directories you can access

### Web Fetching (fetch_*)
- **fetch_fetch**: Fetch content from a URL
  - Supports HTML, JSON, plain text, and other formats
  - Automatically converts HTML to markdown for readability
  - Use for reading web pages, APIs, or downloading content

### Time Operations (time_*)
- **time_get_current_time**: Get the current time in a specific timezone
- **time_convert_time**: Convert time between timezones

### Email Operations (email_*) - if configured
- **email_send**: Send an email
- **email_fetch**: Fetch recent emails from inbox
- **email_search**: Search emails by criteria
- Use configure_settings tool if email credentials are not configured`;
  }

  prompt += `

## Guidelines
- Use ask_user when requirements are ambiguous or you need clarification
- Use embed when sharing media content or locations
- Always format citations as clickable markdown links
- Be concise and helpful`;

  return prompt;
}

// =============================================================================
// Ask User Tool
// =============================================================================

const askUserTool = tool({
  description: `Ask the user a question and wait for their response. The UI will appear inline above the chat input.

Types:
- confirm: Yes/No question
- single_select: Choose one option from a list
- multi_select: Choose multiple options from a list
- text: Free text input

The tool returns immediately with "awaiting_user_input" status. The user's response will be sent as a follow-up message.`,
  parameters: z.object({
    question: z.string().describe("The question to ask the user"),
    type: z.enum(["confirm", "single_select", "multi_select", "text"]).describe("Type of input to collect"),
    options: z.array(z.object({
      value: z.string().describe("The value returned when selected"),
      label: z.string().describe("Display label for the option"),
      description: z.string().optional().describe("Optional description shown below label"),
    })).optional().describe("Options for single_select or multi_select types"),
    page_size: z.number().optional().describe("Number of options per page (default 5)"),
    placeholder: z.string().optional().describe("Placeholder text for text input"),
    allow_cancel: z.boolean().optional().describe("Allow user to cancel/skip (default true)"),
  }),
  execute: async (args) => {
    // This tool returns immediately - the frontend handles user interaction
    // and sends the response as a follow-up message
    return {
      status: "awaiting_user_input",
      ...args,
    };
  },
});

// =============================================================================
// Embed Tool
// =============================================================================

interface EmbedInfo {
  provider: string;
  type: string;
  embed_url?: string;
  id?: string;
  oembed_url?: string;
}

function parseEmbedUrl(url: string): EmbedInfo {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace("www.", "");

    // YouTube
    if (hostname === "youtube.com" || hostname === "youtu.be") {
      const videoId = hostname === "youtu.be"
        ? urlObj.pathname.slice(1).split("?")[0]
        : urlObj.searchParams.get("v");
      if (videoId) {
        return {
          provider: "youtube",
          type: "video",
          id: videoId,
          embed_url: `https://www.youtube.com/embed/${videoId}`,
        };
      }
    }

    // Spotify
    if (hostname === "open.spotify.com") {
      const match = urlObj.pathname.match(/\/(track|album|playlist|episode|show)\/([^/?]+)/);
      if (match) {
        return {
          provider: "spotify",
          type: match[1],
          id: match[2],
          embed_url: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        };
      }
    }

    // Google Maps
    if ((hostname === "google.com" || hostname === "maps.google.com") &&
        (urlObj.pathname.includes("/maps") || hostname === "maps.google.com")) {
      // Try to extract place or coordinates
      const placeMatch = urlObj.pathname.match(/place\/([^/]+)/);
      const coordMatch = urlObj.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

      if (placeMatch || coordMatch) {
        return {
          provider: "google_maps",
          type: "map",
          embed_url: `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(placeMatch ? placeMatch[1] : `${coordMatch![1]},${coordMatch![2]}`)}`,
        };
      }

      // Fallback: just embed the URL directly
      return {
        provider: "google_maps",
        type: "map",
        embed_url: url.replace("/maps/", "/maps/embed?pb="),
      };
    }

    // Twitter/X
    if (hostname === "twitter.com" || hostname === "x.com") {
      const tweetMatch = urlObj.pathname.match(/\/([^/]+)\/status\/(\d+)/);
      if (tweetMatch) {
        return {
          provider: "twitter",
          type: "tweet",
          id: tweetMatch[2],
          oembed_url: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
        };
      }
    }

    // Instagram
    if (hostname === "instagram.com") {
      const postMatch = urlObj.pathname.match(/\/(p|reel)\/([^/?]+)/);
      if (postMatch) {
        return {
          provider: "instagram",
          type: postMatch[1] === "reel" ? "reel" : "post",
          id: postMatch[2],
          oembed_url: `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`,
        };
      }
    }

    // TikTok
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
      const videoMatch = urlObj.pathname.match(/\/@[^/]+\/video\/(\d+)/);
      if (videoMatch) {
        return {
          provider: "tiktok",
          type: "video",
          id: videoMatch[1],
          oembed_url: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        };
      }
    }

    // Facebook
    if (hostname === "facebook.com" || hostname === "fb.com") {
      return {
        provider: "facebook",
        type: "post",
        oembed_url: `https://www.facebook.com/plugins/post/oembed.json/?url=${encodeURIComponent(url)}`,
      };
    }

    // LinkedIn
    if (hostname === "linkedin.com") {
      return {
        provider: "linkedin",
        type: "post",
      };
    }

    // Unknown provider - return as generic link
    return {
      provider: "link",
      type: "link",
    };
  } catch {
    return {
      provider: "link",
      type: "link",
    };
  }
}

// =============================================================================
// Configure Settings Tool
// =============================================================================

const configureSettingsTool = tool({
  description: `Request user to configure specific settings inline. Use when you need API keys, email credentials, or other configuration before proceeding with a task.

Settings keys:
- "email": Email address, password, IMAP/SMTP hosts for email functionality
- "perplexity": Perplexity API key for web search
- "anthropic": Anthropic API key
- "ollama": Ollama URL and model

The tool returns with awaiting_user_input=true. The user will fill out a form in the chat UI, then you can retry the operation.`,
  parameters: z.object({
    settings_key: z.enum(["email", "perplexity", "anthropic", "ollama"]).describe("Which settings to configure"),
    reason: z.string().describe("Brief explanation of why this setting is needed"),
  }),
  execute: async ({ settings_key, reason }) => {
    // This tool returns immediately - the frontend handles user interaction
    return {
      settings_key,
      reason,
      awaiting_user_input: true,
    };
  },
});

// =============================================================================
// Embed Tool
// =============================================================================

const embedTool = tool({
  description: `Embed web content inline in the chat. Supports:
- YouTube videos (youtube.com, youtu.be)
- Spotify tracks/playlists/albums (open.spotify.com)
- Google Maps locations and directions (google.com/maps)
- Twitter/X posts (twitter.com, x.com)
- Instagram posts and reels (instagram.com)
- TikTok videos (tiktok.com)
- Facebook posts (facebook.com)
- LinkedIn posts (linkedin.com)

Use this when sharing relevant media content or locations.`,
  parameters: z.object({
    url: z.string().url().describe("The URL to embed"),
    title: z.string().optional().describe("Optional title/caption for the embed"),
  }),
  execute: async ({ url, title }) => {
    const embedInfo = parseEmbedUrl(url);
    return {
      url,
      title,
      ...embedInfo,
    };
  },
});

// =============================================================================
// Agent Task Management Tools
// =============================================================================

/**
 * Context passed to agent tools during execution
 */
interface AgentToolContext {
  sessionId?: string;
  threadId?: string;
  apiKey?: string;
  perplexityApiKey?: string | null;
}

// Store for passing context to tools during a request
let currentAgentContext: AgentToolContext = {};

/**
 * Set the current agent context for tool execution
 */
function setAgentContext(context: AgentToolContext): void {
  currentAgentContext = context;
}

/**
 * Get the current agent context
 */
function getAgentContext(): AgentToolContext {
  return currentAgentContext;
}

const addTaskTool = tool({
  description: `Add a task to track during this agent session.

Use this to break down complex work into trackable steps.
Each task should be specific and actionable.`,
  parameters: z.object({
    title: z.string().describe("Short task title"),
    description: z.string().describe("Detailed description of what to do"),
    type: z.enum(["plan", "explore", "execute"]).describe("Task category"),
  }),
  execute: async ({ title, description, type }) => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session" };
    }
    const task = addTaskToSession(sessionId, title, description, type);
    return { taskId: task.id, status: "created" };
  },
});

const setTaskTool = tool({
  description: `Update a task's status.

Use 'in_progress' when starting work on a task.
Use 'done' when the task is complete.
Use 'cancelled' if the task cannot be completed.`,
  parameters: z.object({
    taskId: z.string().describe("The task ID to update"),
    status: z.enum(["staged", "in_progress", "done", "cancelled"]).describe("New status"),
    result: z.unknown().optional().describe("Result data when marking done"),
  }),
  execute: async ({ taskId, status, result }) => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session" };
    }
    updateTaskStatus(sessionId, taskId, status, result);
    return { taskId, status, updated: true };
  },
});

const viewTasksTool = tool({
  description: "View all tasks in the current agent session.",
  parameters: z.object({
    filter: z.enum(["all", "pending", "in_progress", "done"]).optional().describe("Filter by status"),
  }),
  execute: async ({ filter }) => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session", tasks: [] };
    }
    let tasks = getSessionTasks(sessionId);
    if (filter && filter !== "all") {
      const statusMap: Record<string, AgentTaskStatus[]> = {
        pending: ["staged"],
        in_progress: ["in_progress"],
        done: ["done", "cancelled"],
      };
      const statuses = statusMap[filter];
      tasks = tasks.filter(t => statuses.includes(t.status));
    }
    return {
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
      })),
    };
  },
});

const clearTasksTool = tool({
  description: "Clear completed and cancelled tasks from the list.",
  parameters: z.object({}),
  execute: async () => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session" };
    }
    clearCompletedTasks(sessionId);
    return { cleared: true };
  },
});

/**
 * Result from orchestration
 */
interface OrchestrationResult {
  success: boolean;
  summary: string;
  tasksSummary: Array<{ title: string; type: string; status: string }>;
  error?: string;
}

/**
 * The complex tool - triggers the orchestration pipeline
 * This is available to the main assistant to delegate complex tasks
 */
const complexTool = tool({
  description: `Trigger the multi-agent orchestration system for complex tasks.

Use this when a task requires:
- Multiple steps or sub-tasks
- Research or information gathering first
- File modifications across multiple files
- Parallel work streams
- Breaking down into trackable progress

Do NOT use for:
- Simple questions or clarifications
- Single-step operations
- Small, direct edits

This tool will plan and execute the task, then return the final result.
Progress will be shown in the task panel while work is ongoing.`,
  parameters: z.object({
    task: z.string().describe("Description of the complex task to plan and execute"),
  }),
  execute: async ({ task }) => {
    const { threadId, apiKey, perplexityApiKey } = getAgentContext();
    if (!threadId) {
      return { error: "No thread context available", success: false };
    }

    if (!apiKey) {
      return { error: "No API key available for plan agent", success: false };
    }

    // Create a new agent session
    const session = createAgentSession(threadId);

    // Store task description for plan agent
    session.planContent = task;

    // Set context for plan agent tools (with sessionId)
    setAgentContext({ sessionId: session.id, threadId, apiKey, perplexityApiKey });

    try {
      // Run the full orchestration pipeline and wait for completion
      const result = await runOrchestrationPipeline(session, task, apiKey, perplexityApiKey);
      return result;
    } catch (err) {
      console.error("[ComplexTool] Orchestration error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        summary: "Orchestration failed",
        tasksSummary: [],
      };
    }
  },
});

/**
 * Run the full orchestration pipeline (planning + execution)
 * Returns the final result summary
 */
async function runOrchestrationPipeline(
  session: AgentSession,
  task: string,
  apiKey: string,
  perplexityApiKey: string | null | undefined
): Promise<OrchestrationResult> {
  // Run plan agent first
  const planResult = await runPlanAgent(session, task, apiKey, perplexityApiKey);

  if (!planResult.success) {
    return {
      success: false,
      summary: planResult.summary,
      tasksSummary: getTasksSummary(session),
      error: planResult.error,
    };
  }

  // If there are execute tasks, run the executor
  const pendingExecuteTasks = Array.from(session.tasks.values())
    .filter(t => t.type === "execute" && (t.status === "staged" || t.status === "in_progress"));

  if (pendingExecuteTasks.length > 0) {
    const execResult = await runExecutorAgent(session, apiKey, perplexityApiKey);
    return {
      success: execResult.success,
      summary: execResult.summary,
      tasksSummary: getTasksSummary(session),
      error: execResult.error,
    };
  }

  // No execute tasks - just return planning result
  return {
    success: true,
    summary: planResult.summary,
    tasksSummary: getTasksSummary(session),
  };
}

/**
 * Get a summary of all tasks in the session
 */
function getTasksSummary(session: AgentSession): Array<{ title: string; type: string; status: string }> {
  return Array.from(session.tasks.values()).map(t => ({
    title: t.title,
    type: t.type,
    status: t.status,
  }));
}

/**
 * Summarize findings tool - used by explore agents to return results
 */
const summarizeFindingsTool = tool({
  description: "Submit your exploration findings. This ends your task and returns results to the parent agent.",
  parameters: z.object({
    summary: z.string().describe("Concise summary of what you found"),
    details: z.string().optional().describe("Additional details if needed"),
    sources: z.array(z.string()).optional().describe("URLs or file paths consulted"),
  }),
  execute: async ({ summary, details, sources }) => {
    // This is captured by the parent orchestrator
    return { summary, details, sources };
  },
});

/**
 * Report completion tool - used by executor sub-agents to report back
 */
const reportCompletionTool = tool({
  description: "Report completion of your assigned tasks. This ends your work and returns results to the parent agent.",
  parameters: z.object({
    success: z.boolean().describe("Whether all tasks completed successfully"),
    summary: z.string().describe("Summary of what was done"),
    errors: z.array(z.string()).optional().describe("Any errors encountered"),
  }),
  execute: async ({ success, summary, errors }) => {
    // This is captured by the parent orchestrator
    return { success, summary, errors };
  },
});

// =============================================================================
// Sub-Agent System Prompts
// =============================================================================

const PLAN_AGENT_PROMPT = `You are a planning agent that analyzes complex tasks and creates execution plans.

Your job:
1. Analyze the user's complex request
2. Break it down into discrete, actionable tasks
3. Use the explore() tool to gather information if needed
4. Use add_task() to create trackable tasks
5. When done planning, summarize what will be done

You have access to:
- explore(prompts): Launch multiple explore agents to gather information in parallel
- add_task(title, description, type): Add a task to track
- set_task(taskId, status): Update task status
- ask_user(question): Ask the user for clarification if needed

Be thorough but efficient. Create clear, specific tasks that can be executed independently where possible.`;

const EXPLORE_AGENT_PROMPT = `You are an autonomous exploration agent.

IMPORTANT: You work COMPLETELY AUTONOMOUSLY.
- You CANNOT ask questions or interact with humans
- You CANNOT expect any user messages
- You must complete your research independently

You have access to tools for:
- Web search (perplexity_ask, perplexity_research)
- File reading (filesystem_read_file, filesystem_list_directory)
- Web fetching (fetch_fetch)

Research thoroughly, then call summarize_findings() with a concise summary.
Focus on facts and specific details. Be concise but complete.`;

const SUB_EXECUTOR_PROMPT = `You are an autonomous executor sub-agent.

IMPORTANT: You work COMPLETELY AUTONOMOUSLY.
- You CANNOT ask questions or interact with humans
- You CANNOT expect any user messages
- You must complete your tasks independently or report failure

Your job:
1. Execute the assigned tasks using available tools
2. Call set_task(taskId, 'in_progress') when starting a task
3. Call set_task(taskId, 'done') when completing a task
4. Call report_completion() when finished with all tasks

If you encounter a blocking issue you cannot resolve:
1. Call set_task(taskId, 'cancelled') with reason
2. Call report_completion(success: false, errors: [...])`;

const EXECUTOR_AGENT_PROMPT = `You are the main executor agent. You execute the tasks that were created during planning.

Your job:
1. Review the pending tasks using view_tasks()
2. For tasks that can be parallelized, use execute() to spawn sub-agents
3. For tasks that need sequential execution or coordination, execute them yourself
4. Mark tasks as in_progress before starting, and done when complete
5. You CAN use ask_user if you need clarification from the user

Available tools:
- view_tasks: See all tasks and their status
- set_task: Update task status (in_progress, done, cancelled)
- execute: Spawn parallel sub-agents for independent work streams
- All MCP tools (filesystem, fetch, etc.)
- ask_user: Ask the user for clarification if needed

Execute all pending tasks, then report completion.`;

// =============================================================================
// Plan Agent Execution
// =============================================================================

/**
 * Result from an agent run
 */
interface AgentRunResult {
  success: boolean;
  summary: string;
  error?: string;
}

/**
 * Run the plan agent and broadcast tool calls
 * Returns result when planning is complete
 */
async function runPlanAgent(
  session: AgentSession,
  task: string,
  apiKey: string,
  perplexityApiKey: string | null | undefined
): Promise<AgentRunResult> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");
  const threadId = session.threadId;

  // Get MCP tools
  const mcpTools = getMCPToolsForAISDK();
  const perplexityTools = createPerplexityTools(perplexityApiKey);

  // Build tools for plan agent (filter out undefined tools)
  const planAgentTools: Record<string, CoreTool> = {
    add_task: addTaskTool,
    set_task: setTaskTool,
    view_tasks: viewTasksTool,
    explore: exploreTool,
    ask_user: askUserTool,
    ...mcpTools,
  };
  // Add perplexity tools if available
  for (const [name, tool] of Object.entries(perplexityTools)) {
    if (tool !== undefined) {
      planAgentTools[name] = tool;
    }
  }

  try {
    console.log(`[PlanAgent] Starting for session ${session.id}, task: ${task.slice(0, 100)}...`);

    // Use streamText so we can broadcast tool calls as they happen
    const result = streamText({
      model,
      system: PLAN_AGENT_PROMPT + `\n\nThe task to plan:\n${task}`,
      messages: [{ role: "user", content: "Begin planning this task now. Break it down into actionable steps. When done, provide a summary of the plan." }],
      tools: planAgentTools,
      maxSteps: 15,
    });

    // Collect final text for summary
    let finalText = "";

    // Stream and broadcast tool calls
    for await (const part of result.fullStream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;

      if (p.type === "text-delta") {
        finalText += p.textDelta as string;
      } else if (p.type === "tool-call") {
        const toolCallId = p.toolCallId as string;
        const toolName = p.toolName as string;
        const args = p.args;

        console.log(`[PlanAgent] Tool call: ${toolName}`);

        // Broadcast tool call
        broadcastToThread(threadId, {
          type: "tool_call",
          sessionId: session.id,
          threadId,
          toolCall: {
            id: toolCallId,
            toolName,
            status: "calling",
            args: args as Record<string, unknown> | undefined,
          },
        });
      } else if (p.type === "tool-result") {
        const toolCallId = p.toolCallId as string;
        const toolName = p.toolName as string;

        console.log(`[PlanAgent] Tool result: ${toolName}`);

        // Broadcast tool result
        broadcastToThread(threadId, {
          type: "tool_result",
          sessionId: session.id,
          threadId,
          toolCall: {
            id: toolCallId,
            toolName,
            status: "done",
            result: typeof p.result === "string" ? p.result : JSON.stringify(p.result),
          },
        });
      }
    }

    // Check if there are pending execute tasks
    const tasks = Array.from(session.tasks.values());
    const pendingExecuteTasks = tasks.filter(
      (t) => t.type === "execute" && (t.status === "staged" || t.status === "in_progress")
    );

    if (pendingExecuteTasks.length > 0) {
      // Planning done, but execution tasks remain - set to "executing"
      session.status = "executing";
      broadcastToThread(threadId, {
        type: "session_updated",
        sessionId: session.id,
        threadId,
        session: { id: session.id, status: session.status },
      });
      console.log(`[PlanAgent] Planning complete, ${pendingExecuteTasks.length} execute tasks pending`);
    }

    const summary = finalText || `Planning complete. Created ${tasks.length} tasks.`;
    console.log(`[PlanAgent] Completed for session ${session.id}`);

    return { success: true, summary };
  } catch (error) {
    console.error(`[PlanAgent] Error:`, error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Clean up any in_progress tasks
    cleanupIncompleteTasks(session, `Planning error: ${errorMsg}`);

    session.status = "error";
    session.error = errorMsg;
    broadcastToThread(threadId, {
      type: "session_error",
      sessionId: session.id,
      threadId,
      session: { id: session.id, status: session.status, error: session.error },
    });
    return { success: false, summary: "Planning failed", error: errorMsg };
  }
}

/**
 * Run the executor agent to execute pending tasks
 * Returns result when execution is complete
 */
async function runExecutorAgent(
  session: AgentSession,
  apiKey: string,
  perplexityApiKey: string | null | undefined
): Promise<AgentRunResult> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");
  const threadId = session.threadId;

  // Set context for task tools
  setAgentContext({ sessionId: session.id, threadId, apiKey, perplexityApiKey });

  // Get MCP tools
  const mcpTools = getMCPToolsForAISDK();
  const perplexityTools = createPerplexityTools(perplexityApiKey);

  // Build tools for executor agent (filter out undefined tools)
  const executorTools: Record<string, CoreTool> = {
    view_tasks: viewTasksTool,
    set_task: setTaskTool,
    execute: executeTool,
    ask_user: askUserTool,  // Executor CAN ask user
    ...mcpTools,
  };
  // Add perplexity tools if available
  for (const [name, tool] of Object.entries(perplexityTools)) {
    if (tool !== undefined) {
      executorTools[name] = tool;
    }
  }

  // Get current pending tasks for context
  const pendingTasks = Array.from(session.tasks.values())
    .filter(t => t.type === "execute" && (t.status === "staged" || t.status === "in_progress"));

  const taskList = pendingTasks.map(t => `- [${t.id}] ${t.title}: ${t.description}`).join("\n");

  try {
    console.log(`[ExecutorAgent] Starting for session ${session.id}, ${pendingTasks.length} pending tasks`);

    // Use streamText so we can broadcast tool calls as they happen
    const result = streamText({
      model,
      system: EXECUTOR_AGENT_PROMPT + `\n\nPending execute tasks:\n${taskList}`,
      messages: [{ role: "user", content: "Execute all pending tasks now. Mark each task as in_progress before starting and done when complete. When finished, provide a summary of what was accomplished." }],
      tools: executorTools,
      maxSteps: 30,  // More steps for execution
    });

    // Collect final text for summary
    let finalText = "";

    // Stream and broadcast tool calls
    for await (const part of result.fullStream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;

      if (p.type === "text-delta") {
        finalText += p.textDelta as string;
      } else if (p.type === "tool-call") {
        const toolCallId = p.toolCallId as string;
        const toolName = p.toolName as string;
        const args = p.args;

        console.log(`[ExecutorAgent] Tool call: ${toolName}`);

        // Broadcast tool call
        broadcastToThread(threadId, {
          type: "tool_call",
          sessionId: session.id,
          threadId,
          toolCall: {
            id: toolCallId,
            toolName,
            status: "calling",
            args: args as Record<string, unknown> | undefined,
          },
        });
      } else if (p.type === "tool-result") {
        const toolCallId = p.toolCallId as string;
        const toolName = p.toolName as string;

        console.log(`[ExecutorAgent] Tool result: ${toolName}`);

        // Broadcast tool result
        broadcastToThread(threadId, {
          type: "tool_result",
          sessionId: session.id,
          threadId,
          toolCall: {
            id: toolCallId,
            toolName,
            status: "done",
            result: typeof p.result === "string" ? p.result : JSON.stringify(p.result),
          },
        });
      }
    }

    // Check if all execute tasks are done
    const remainingTasks = Array.from(session.tasks.values())
      .filter(t => t.type === "execute" && (t.status === "staged" || t.status === "in_progress"));
    const completedTasks = Array.from(session.tasks.values())
      .filter(t => t.status === "done");

    if (remainingTasks.length === 0) {
      session.status = "complete";
      broadcastToThread(threadId, {
        type: "session_complete",
        sessionId: session.id,
        threadId,
        session: { id: session.id, status: session.status },
      });
      console.log(`[ExecutorAgent] All tasks completed for session ${session.id}`);
    } else {
      // Mark remaining in_progress tasks as cancelled since we're done
      cleanupIncompleteTasks(session, "Executor finished without completing this task");
      console.log(`[ExecutorAgent] ${remainingTasks.length} tasks still pending, marked as cancelled`);
    }

    const summary = finalText || `Execution complete. Completed ${completedTasks.length} tasks.`;
    return { success: remainingTasks.length === 0, summary };
  } catch (error) {
    console.error(`[ExecutorAgent] Error:`, error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Clean up any in_progress tasks
    cleanupIncompleteTasks(session, `Error: ${errorMsg}`);

    session.status = "error";
    session.error = errorMsg;
    broadcastToThread(threadId, {
      type: "session_error",
      sessionId: session.id,
      threadId,
      session: { id: session.id, status: session.status, error: session.error },
    });
    return { success: false, summary: "Execution failed", error: errorMsg };
  }
}

/**
 * Clean up incomplete tasks when session ends
 * Marks in_progress tasks as cancelled
 */
function cleanupIncompleteTasks(session: AgentSession, reason: string): void {
  const threadId = session.threadId;

  for (const task of session.tasks.values()) {
    if (task.status === "in_progress") {
      task.status = "cancelled";
      task.completedAt = new Date();
      task.result = reason;

      // Broadcast the update
      broadcastToThread(threadId, {
        type: "task_updated",
        sessionId: session.id,
        threadId,
        task,
      });
    }
  }
}

// =============================================================================
// Explore & Execute Tools (for Plan/Executor Agents)
// =============================================================================

/**
 * Execute an explore agent with a specific prompt
 * Returns the summary from summarize_findings call
 */
async function runExploreAgent(
  prompt: string,
  apiKey: string,
  perplexityApiKey: string | null | undefined,
  mcpToolsForAgent: Record<string, CoreTool>
): Promise<string> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");

  // Build tools for explore agent (no ask_user - autonomous)
  const perplexityTools = createPerplexityTools(perplexityApiKey);
  const exploreTools: Record<string, CoreTool> = {
    summarize_findings: summarizeFindingsTool,
    ...mcpToolsForAgent,
  };
  // Add perplexity tools if available
  for (const [name, tool] of Object.entries(perplexityTools)) {
    if (tool !== undefined) {
      exploreTools[name] = tool;
    }
  }

  const result = await generateText({
    model,
    system: EXPLORE_AGENT_PROMPT + `\n\nYour exploration task:\n${prompt}`,
    messages: [{ role: "user", content: "Begin your research now." }],
    tools: exploreTools,
    maxSteps: 10,
  });

  // Extract summary from summarize_findings call
  const summaryCall = result.toolCalls?.find(c => c.toolName === "summarize_findings");
  const args = summaryCall?.args as { summary?: string } | undefined;
  return args?.summary ?? result.text;
}

/**
 * Execute an executor sub-agent with assigned tasks
 * Returns the completion report
 */
async function runExecutorSubAgent(
  taskIds: string[],
  context: string,
  sessionId: string,
  apiKey: string,
  mcpToolsForAgent: Record<string, CoreTool>
): Promise<{ taskIds: string[]; success: boolean; summary: string; errors?: string[] }> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");

  // Set context for task tools (include apiKey for nested sub-agent spawning)
  const session = agentSessions.get(sessionId);
  setAgentContext({ sessionId, threadId: session?.threadId, apiKey });

  // Build tools for executor sub-agent (no ask_user - autonomous)
  const executorTools = {
    ...mcpToolsForAgent,
    set_task: setTaskTool,
    report_completion: reportCompletionTool,
  };

  const result = await generateText({
    model,
    system: SUB_EXECUTOR_PROMPT + `\n\nAssigned tasks: ${taskIds.join(", ")}\n\nContext:\n${context}`,
    messages: [{ role: "user", content: "Execute your assigned tasks now." }],
    tools: executorTools,
    maxSteps: 20,
  });

  // Extract report from report_completion call
  const reportCall = result.toolCalls?.find(c => c.toolName === "report_completion");
  const reportArgs = reportCall?.args as { success?: boolean; summary?: string; errors?: string[] } | undefined;
  const success = reportArgs?.success ?? false;
  const summary = reportArgs?.summary ?? result.text;
  const errors = reportArgs?.errors;

  return { taskIds, success, summary, errors };
}

/**
 * The explore tool - spawns concurrent explore sub-agents
 * Used by the Plan Agent to gather information
 */
const exploreTool = tool({
  description: `Launch multiple explore agents concurrently to gather information.
Each prompt spawns a separate autonomous agent that researches and returns findings.
This tool blocks until all agents complete.

Use this to gather information in parallel before planning.`,
  parameters: z.object({
    prompts: z.array(z.string()).describe("Array of exploration prompts, one per agent"),
  }),
  execute: async ({ prompts }) => {
    const { sessionId, threadId, apiKey, perplexityApiKey } = getAgentContext();
    const session = sessionId ? agentSessions.get(sessionId) : undefined;

    // Use API key from context
    if (!apiKey) {
      return { error: "No API key available for sub-agents", results: [] };
    }

    // Broadcast explore start
    if (threadId) {
      broadcastToThread(threadId, {
        type: "explore_started",
        sessionId: sessionId ?? "",
        threadId,
        count: prompts.length,
        prompts,
      });
    }

    // Update session status
    if (session) {
      updateSessionStatus(sessionId!, "exploring");
    }

    // Get MCP tools for sub-agents
    const mcpToolsForAgent = getMCPToolsForAISDK();

    // Spawn all explore agents concurrently
    const results = await Promise.all(
      prompts.map(async (prompt, index) => {
        // Broadcast individual agent start
        if (threadId) {
          broadcastToThread(threadId, {
            type: "sub_agent_started",
            sessionId: sessionId ?? "",
            threadId,
            index,
            prompt,
          });
        }

        try {
          const summary = await runExploreAgent(prompt, apiKey, perplexityApiKey, mcpToolsForAgent);

          // Broadcast completion
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_agent_done",
              sessionId: sessionId ?? "",
              threadId,
              index,
              summary,
            });
          }

          return summary;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_agent_done",
              sessionId: sessionId ?? "",
              threadId,
              index,
              summary: `Error: ${errorMsg}`,
            });
          }
          return `Error exploring: ${errorMsg}`;
        }
      })
    );

    // Broadcast all exploration complete
    if (threadId) {
      broadcastToThread(threadId, {
        type: "explore_complete",
        sessionId: sessionId ?? "",
        threadId,
        results,
      });
    }

    return { results };
  },
});

/**
 * The execute tool - spawns concurrent executor sub-agents
 * Used by the Executor Agent to parallelize work
 */
const executeTool = tool({
  description: `Delegate tasks to parallel executor sub-agents.
Each sub-agent works AUTONOMOUSLY (no human interaction).
Assign tasks by ID so sub-agents can mark them complete.

Use this to parallelize independent work streams.`,
  parameters: z.object({
    assignments: z.array(z.object({
      tasks: z.array(z.string()).describe("Task IDs to assign to this sub-agent"),
      context: z.string().describe("Instructions and context for the sub-agent"),
    })).describe("Array of task assignments, one per sub-agent"),
  }),
  execute: async ({ assignments }) => {
    const { sessionId, threadId, apiKey } = getAgentContext();

    // Use API key from context
    if (!apiKey) {
      return { error: "No API key available for sub-agents", results: [] };
    }

    if (!sessionId) {
      return { error: "No active agent session", results: [] };
    }

    // Update session status
    updateSessionStatus(sessionId, "executing");

    // Get MCP tools for sub-agents
    const mcpToolsForAgent = getMCPToolsForAISDK();

    // Spawn all executor sub-agents concurrently
    const results = await Promise.all(
      assignments.map(async ({ tasks, context }, index) => {
        // Broadcast sub-executor start
        if (threadId) {
          broadcastToThread(threadId, {
            type: "sub_executor_started",
            sessionId,
            threadId,
            index,
            taskIds: tasks,
          });
        }

        try {
          const result = await runExecutorSubAgent(tasks, context, sessionId, apiKey, mcpToolsForAgent);

          // Broadcast completion
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_executor_done",
              sessionId,
              threadId,
              index,
              taskIds: tasks,
              summary: result.summary,
              success: result.success,
            });
          }

          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_executor_done",
              sessionId,
              threadId,
              index,
              taskIds: tasks,
              summary: `Error: ${errorMsg}`,
              success: false,
            });
          }
          return { taskIds: tasks, success: false, summary: `Error: ${errorMsg}`, errors: [errorMsg] };
        }
      })
    );

    return { results };
  },
});

// =============================================================================
// Perplexity Tools
// =============================================================================

function createPerplexityTools(apiKey: string | null | undefined) {
  if (!apiKey) {
    return {};
  }

  const callPerplexity = async (
    model: string,
    query: string
  ): Promise<{ content: string; citations: string[] }> => {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: query }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      citations?: string[];
    };

    return {
      content: data.choices[0]?.message?.content ?? "",
      citations: data.citations ?? [],
    };
  };

  return {
    perplexity_ask: tool({
      description: "Quick web search for current information. Returns concise answers with source citations. Best for quick questions, facts, and current events.",
      parameters: z.object({
        query: z.string().describe("The question or search query"),
      }),
      execute: async ({ query }) => {
        const result = await callPerplexity("sonar", query);
        return truncateToolResultForContext({
          answer: result.content,
          citations: result.citations,
        });
      },
    }),

    perplexity_research: tool({
      description: "Deep research on complex topics. Provides comprehensive analysis with detailed citations. Best for in-depth investigation and thorough understanding.",
      parameters: z.object({
        query: z.string().describe("The research topic or question"),
      }),
      execute: async ({ query }) => {
        const result = await callPerplexity("sonar-pro", query);
        return truncateToolResultForContext({
          research: result.content,
          citations: result.citations,
        });
      },
    }),

    perplexity_reason: tool({
      description: "Advanced reasoning and analysis. Provides step-by-step logical reasoning with citations. Best for complex problems requiring structured thinking.",
      parameters: z.object({
        query: z.string().describe("The problem or question to analyze"),
      }),
      execute: async ({ query }) => {
        const result = await callPerplexity("sonar-reasoning", query);
        return truncateToolResultForContext({
          reasoning: result.content,
          citations: result.citations,
        });
      },
    }),
  };
}

// =============================================================================
// HTTP Server
// =============================================================================

const app = new Hono();

// Enable CORS for frontend
app.use("/*", cors({
  origin: ["http://localhost:1420", "tauri://localhost"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Test email connection by connecting the MCP server and invoking read/send tools
app.post("/api/email/test", async (c) => {
  try {
    const body = await c.req.json() as { emailConfig?: EmailConfig };
    const emailConfig = body.emailConfig;
    if (!emailConfig?.address || !emailConfig?.password) {
      return c.json({ success: false, error: "Email address and password are required" }, 400);
    }
    // Force reconnect by clearing the cached config
    lastEmailConfig = null;
    emailMCPConnected = false;
    await connectEmailMCPIfNeeded(emailConfig);
    if (!emailMCPConnected) {
      return c.json({ success: false, error: "Failed to start email server" });
    }

    const connection = mcpConnections.get("email");
    if (!connection) {
      return c.json({ success: false, error: "Email server not available" });
    }

    const errors: string[] = [];

    // Test IMAP by listing emails (triggers real IMAP auth)
    const imapTool = connection.tools.has("list_emails") ? "list_emails" :
                     connection.tools.has("fetch_emails") ? "fetch_emails" : null;
    if (imapTool) {
      try {
        const schema = connection.tools.get(imapTool)?.inputSchema;
        const args: Record<string, unknown> = {};
        const required = (schema as { required?: string[] })?.required ?? [];
        if (required.includes("account_name")) args.account_name = "default";
        if (required.includes("pageSize") || !required.includes("limit")) args.pageSize = 1;
        else args.limit = 1;

        const result = await connection.client.callTool({ name: imapTool, arguments: args });
        const content = result.content as Array<{ type: string; text?: string }>;
        const errorText = content?.find((c) => c.type === "text" && c.text?.includes("Error"))?.text;
        if (result.isError || errorText) {
          errors.push(`IMAP: ${errorText ?? "Unknown error"}`);
        }
      } catch (err) {
        errors.push(`IMAP: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Test SMTP by sending a test email to self (triggers real SMTP auth)
    const smtpTool = connection.tools.has("send_email") ? "send_email" : null;
    if (smtpTool) {
      try {
        const schema = connection.tools.get(smtpTool)?.inputSchema;
        const required = (schema as { required?: string[] })?.required ?? [];
        const args: Record<string, unknown> = {
          subject: "AIOS Connection Test",
          body: "This is an automated connection test from AIOS Chat. You can safely delete this email.",
        };
        // Adapt to whichever field names the schema requires
        if (required.includes("account_name")) args.account_name = "default";
        if (required.includes("recipients")) args.recipients = [emailConfig.address];
        if (required.includes("to")) args.to = emailConfig.address;

        const result = await connection.client.callTool({ name: smtpTool, arguments: args });
        const content = result.content as Array<{ type: string; text?: string }>;
        const errorText = content?.find((c) => c.type === "text" && c.text?.includes("Error"))?.text;
        if (result.isError || errorText) {
          errors.push(`SMTP: ${errorText ?? "Unknown error"}`);
        }
      } catch (err) {
        errors.push(`SMTP: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (errors.length > 0) {
      return c.json({ success: false, error: errors.join("; ") });
    }
    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message });
  }
});

// Get system prompt (for debugging)
app.get("/api/system-prompt", (c) => {
  const hasMCPTools = mcpConnections.size > 0;
  const prompt = generateSystemPrompt(true, hasMCPTools);
  return c.json({ prompt });
});

// Get MCP server status
app.get("/api/mcp/status", (c) => {
  const status: Record<string, { connected: boolean; tools: string[] }> = {};

  for (const [name, connection] of mcpConnections) {
    status[name] = {
      connected: true,
      tools: Array.from(connection.tools.keys()),
    };
  }

  return c.json({ servers: status });
});

// Get agent session for a thread
app.get("/api/agent/session/:threadId", (c) => {
  const threadId = c.req.param("threadId");
  const session = getSessionByThread(threadId);

  if (!session) {
    return c.json({ session: null, tasks: [] });
  }

  return c.json({
    session: {
      id: session.id,
      threadId: session.threadId,
      status: session.status,
      error: session.error,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    },
    tasks: Array.from(session.tasks.values()).map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      type: t.type,
      status: t.status,
      result: t.result,
      createdAt: t.createdAt.toISOString(),
      startedAt: t.startedAt?.toISOString(),
      completedAt: t.completedAt?.toISOString(),
    })),
  });
});

// =============================================================================
// Context Length Management
// =============================================================================

// Message types for chat API
interface ChatToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: string;
  result?: unknown;
}

interface ChatToolResult {
  toolCallId: string;
  result: unknown;
}

interface ChatIncomingMessage {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ChatToolInvocation[];
  toolResults?: ChatToolResult[];
}

/**
 * Count tokens using Anthropic's API (accurate for Claude models)
 * Note: Tool schemas are accounted for separately as overhead
 */
async function countTokensAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt?: string
): Promise<number> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.countTokens({
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    ...(systemPrompt ? { system: systemPrompt } : {}),
  });

  console.log(`[Context] Anthropic countTokens result: ${response.input_tokens}`);
  return response.input_tokens;
}

/**
 * Estimate tokens for text (uses char-based estimate)
 * Very conservative: ~2 chars per token to avoid underestimating
 */
function estimateTokens(text: string): number {
  // Very conservative estimate: ~2 chars per token
  // This overestimates but better safe than hitting API limits
  return Math.ceil(text.length / 2);
}

/**
 * Get max context tokens for a provider/model
 * Note: Tool overhead is calculated separately based on actual tool schemas
 */
function getMaxContextTokens(provider: string, model?: string): number {
  // Reserve space for response (8k tokens)
  const responseBuffer = 8000;

  if (provider === "anthropic") {
    // Claude models support up to 200k tokens
    return 200000 - responseBuffer;
  }

  // Ollama models vary - be conservative
  if (model?.includes("qwen")) {
    return 30000 - responseBuffer;
  }
  if (model?.includes("llama")) {
    return 120000 - responseBuffer;
  }
  if (model?.includes("deepseek")) {
    return 60000 - responseBuffer;
  }

  return Math.max(8000, 16000 - responseBuffer);
}

/**
 * Truncate a large tool result to avoid consuming too much context
 * Shows first N lines, a redaction notice, and last portion up to max chars
 */
function truncateToolResult(result: unknown, maxChars: number = 50000): unknown {
  if (result === null || result === undefined) {
    return result;
  }

  // Convert to string for size check
  const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);

  if (resultStr.length <= maxChars) {
    return result;
  }

  console.log(`[Context] Truncating tool result: ${resultStr.length} chars -> ${maxChars} chars`);

  const lines = resultStr.split("\n");
  const firstLines = 10;
  const redactionNotice = "\n\n[... content truncated due to length ...]\n\n";

  // Calculate how much space we have after first lines and notice
  const firstPart = lines.slice(0, firstLines).join("\n");
  const remainingChars = maxChars - firstPart.length - redactionNotice.length;

  if (remainingChars <= 0) {
    // Just return first lines with notice
    return firstPart + redactionNotice + "[end of truncated content]";
  }

  // Get the last portion that fits
  const lastPart = resultStr.slice(-remainingChars);

  // Try to start at a line boundary for cleaner output
  const newlineIndex = lastPart.indexOf("\n");
  const cleanLastPart = newlineIndex > 0 && newlineIndex < 100
    ? lastPart.slice(newlineIndex + 1)
    : lastPart;

  const truncated = firstPart + redactionNotice + cleanLastPart;

  // If original was an object, return as string (can't reconstruct valid JSON)
  return truncated;
}

/**
 * Truncate tool results in messages to reduce context size
 */
function truncateToolResultsInMessages(
  messages: ChatIncomingMessage[],
  maxResultChars: number
): ChatIncomingMessage[] {
  return messages.map((msg): ChatIncomingMessage => {
    const newMsg: ChatIncomingMessage = { ...msg };

    // Truncate tool invocations results (on assistant messages)
    if (newMsg.toolInvocations && newMsg.toolInvocations.length > 0) {
      newMsg.toolInvocations = newMsg.toolInvocations.map((inv): ChatToolInvocation => {
        if (inv.result !== undefined) {
          return { ...inv, result: truncateToolResult(inv.result, maxResultChars) };
        }
        return inv;
      });
    }

    // Truncate tool results (on user messages that contain tool results)
    if (newMsg.toolResults && newMsg.toolResults.length > 0) {
      newMsg.toolResults = newMsg.toolResults.map((tr): ChatToolResult => {
        if (tr.result !== undefined) {
          return { ...tr, result: truncateToolResult(tr.result, maxResultChars) };
        }
        return tr;
      });
    }

    return newMsg;
  });
}

/**
 * Trim messages to fit within context limit
 */
async function trimMessagesToFit<T extends { role: "user" | "assistant"; content: string; toolInvocations?: unknown[]; toolResults?: unknown[] }>(
  messages: T[],
  provider: string,
  model: string,
  apiKey: string | undefined,
  systemPrompt: string | undefined,
  maxTokens: number,
  toolsOverheadTokens: number = 0
): Promise<T[]> {
  // Subtract tools overhead from max tokens (tools aren't counted by the API but consume context)
  const effectiveMaxTokens = maxTokens - toolsOverheadTokens;
  const targetTokens = effectiveMaxTokens;
  console.log(`[Context] ====== TRIMMING START ======`);
  console.log(`[Context] Provider: ${provider}, Model: ${model}`);
  console.log(`[Context] Messages count: ${messages.length}`);
  console.log(`[Context] Max tokens: ${maxTokens}, Tools overhead: ${toolsOverheadTokens}, Effective: ${effectiveMaxTokens}`);
  console.log(`[Context] Has API key: ${!!apiKey}`);
  const minKeep = Math.min(2, messages.length);

  // For Anthropic, use the API to count tokens
  if (provider === "anthropic" && apiKey) {
    console.log(`[Context] Using Anthropic token counting API`);
    try {
      // Convert messages for counting (flatten tool invocations into content)
      const countableMessages = messages.map((m) => ({
        role: m.role,
        content: m.content + (m.toolInvocations ? JSON.stringify(m.toolInvocations) : ""),
      }));

      // Log total char size for debugging
      const totalChars = countableMessages.reduce((sum, m) => sum + m.content.length, 0);
      console.log(`[Context] Total message chars: ${totalChars}`);

      const totalTokens = await countTokensAnthropic(apiKey, model, countableMessages, systemPrompt);
      console.log(`[Context] Anthropic token count: ${totalTokens} (target: ${targetTokens})`);

      if (totalTokens <= targetTokens) {
        console.log(`[Context] No trimming needed`);
        return messages;
      }

      console.log(`[Context] TRIMMING REQUIRED: ${totalTokens} tokens > ${targetTokens} target`);

      // Binary search for the right number of messages to keep
      let left = minKeep;
      let right = messages.length;

      while (left < right) {
        const mid = Math.ceil((left + right) / 2);
        const subset = messages.slice(-mid);
        const subsetCountable = subset.map((m) => ({
          role: m.role,
          content: m.content + (m.toolInvocations ? JSON.stringify(m.toolInvocations) : ""),
        }));

        const subsetTokens = await countTokensAnthropic(apiKey, model, subsetCountable, systemPrompt);

        if (subsetTokens <= targetTokens) {
          left = mid;
        } else {
          right = mid - 1;
        }
      }

      const kept = messages.slice(-left);
      // Verify the trimmed count
      const trimmedCountable = kept.map((m) => ({
        role: m.role,
        content: m.content + (m.toolInvocations ? JSON.stringify(m.toolInvocations) : ""),
      }));
      const trimmedTokens = await countTokensAnthropic(apiKey, model, trimmedCountable, systemPrompt);
      console.log(`[Context] Kept ${kept.length}/${messages.length} messages (${trimmedTokens} tokens)`);
      return kept;
    } catch (error) {
      console.error("[Context] !!!! Token counting API FAILED !!!!");
      console.error("[Context] Error:", error);
      console.error("[Context] Falling back to character-based estimation");
      // Fall through to estimation
    }
  } else {
    console.log(`[Context] Skipping Anthropic API (provider=${provider}, hasKey=${!!apiKey})`);
  }

  // For Ollama or fallback: use estimation
  console.log(`[Context] Using character-based estimation (2 chars per token)`);
  let totalTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  const tokenCounts = messages.map((msg) => {
    let count = estimateTokens(msg.content);
    if (msg.toolInvocations) count += estimateTokens(JSON.stringify(msg.toolInvocations));
    if (msg.toolResults) count += estimateTokens(JSON.stringify(msg.toolResults));
    totalTokens += count;
    return count;
  });

  if (totalTokens <= targetTokens) {
    return messages;
  }

  console.log(`[Context] Trimming: ~${totalTokens} tokens > ${targetTokens} target`);

  let trimmedMessages = [...messages];
  let currentTokens = totalTokens;
  let removeIndex = 0;

  while (currentTokens > targetTokens && trimmedMessages.length > minKeep) {
    currentTokens -= tokenCounts[removeIndex];
    removeIndex++;
    trimmedMessages = messages.slice(removeIndex);
  }

  console.log(`[Context] Kept ${trimmedMessages.length}/${messages.length} messages (~${currentTokens} tokens)`);
  return trimmedMessages;
}

/**
 * Stream chat response
 */
app.post("/api/chat", async (c) => {
  // Use module-level types: ChatIncomingMessage, ChatToolInvocation, ChatToolResult

  const body = await c.req.json<{
    messages: ChatIncomingMessage[];
    threadId?: string;
    apiKey?: string;
    perplexityApiKey?: string | null;
    model?: string;
    enableTools?: boolean;
    provider?: "anthropic" | "ollama";
    ollamaBaseUrl?: string;
    emailConfig?: EmailConfig;
  }>();

  const {
    messages: incomingMessages,
    threadId,
    apiKey,
    perplexityApiKey,
    model,
    enableTools = true,
    provider: providerType = "anthropic",
    ollamaBaseUrl = "http://localhost:11434",
    emailConfig,
  } = body;

  // Connect email MCP server if credentials are provided
  if (emailConfig?.address && emailConfig?.password) {
    await connectEmailMCPIfNeeded(emailConfig);
  }

  // Set agent context for tool execution (includes API keys for plan agent)
  setAgentContext({ threadId, apiKey, perplexityApiKey });

  // Create the appropriate model based on provider
  let aiModel: LanguageModelV1;

  if (providerType === "ollama") {
    const ollamaProvider = ollamaBaseUrl === "http://localhost:11434"
      ? ollama
      : createOllama({ baseURL: ollamaBaseUrl });
    aiModel = ollamaProvider(model ?? "qwen3-vl:latest");
  } else {
    if (!apiKey) {
      return c.json({ error: "API key required for Anthropic" }, 400);
    }
    const anthropic = createAnthropic({ apiKey });
    aiModel = anthropic(model ?? "claude-sonnet-4-20250514");
  }

  // Build tools
  const perplexityTools = createPerplexityTools(perplexityApiKey);
  const mcpTools = getMCPToolsForAISDK();
  const hasMCPTools = Object.keys(mcpTools).length > 0;

  const allTools = enableTools ? {
    ask_user: askUserTool,
    embed: embedTool,
    configure_settings: configureSettingsTool,  // For inline settings configuration
    complex: complexTool,  // For triggering multi-agent orchestration
    ...perplexityTools,
    ...mcpTools,
  } : {};

  // Generate system prompt
  const systemPrompt = generateSystemPrompt(!!perplexityApiKey, hasMCPTools);

  // Context management: truncate large tool results and trim old messages
  const willUseTools = enableTools && Object.keys(allTools).length > 0;
  const maxTokens = getMaxContextTokens(providerType, model);
  const modelName = model ?? (providerType === "ollama" ? "qwen3-vl:latest" : "claude-sonnet-4-20250514");

  console.log(`[Context] Provider: ${providerType}, Model: ${modelName}, Tools: ${willUseTools}, Max tokens: ${maxTokens}`);

  // First, truncate large tool results to avoid any single result consuming too much context
  // Max result size is ~1/4 of context to allow room for multiple tool calls
  const maxToolResultChars = Math.floor(maxTokens * 3.5 / 4); // ~tokens * chars_per_token / 4
  const truncatedIncoming = truncateToolResultsInMessages(incomingMessages, maxToolResultChars);

  // Calculate tools overhead (tools aren't counted by countTokens API but consume context)
  // Use very conservative estimate: 2 chars per token
  const toolsJson = willUseTools ? JSON.stringify(allTools) : "";
  const toolsOverheadTokens = Math.ceil(toolsJson.length / 2);
  console.log(`[Context] Tools JSON size: ${toolsJson.length} chars, estimated overhead: ${toolsOverheadTokens} tokens`);

  // Then trim old messages if needed to fit within context
  const processedMessages = await trimMessagesToFit(
    truncatedIncoming,
    providerType,
    modelName,
    apiKey,
    willUseTools ? systemPrompt : undefined,
    maxTokens,
    toolsOverheadTokens
  );

  // Convert processed messages to AI SDK CoreMessage format
  type CoreMessage =
    | { role: "user"; content: string }
    | { role: "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }> }
    | { role: "tool"; content: Array<{ type: "tool-result"; toolCallId: string; toolName: string; result: unknown }> };

  const rawMessages: CoreMessage[] = [];

  for (const msg of processedMessages) {
    if (msg.role === "assistant" && msg.toolInvocations && msg.toolInvocations.length > 0) {
      // Assistant message with tool calls
      const content: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }> = [];
      // Only add text block if content is non-empty (Anthropic requires non-empty text blocks)
      if (msg.content && msg.content.trim() !== "") {
        content.push({ type: "text", text: msg.content });
      }
      for (const inv of msg.toolInvocations) {
        content.push({
          type: "tool-call",
          toolCallId: inv.toolCallId,
          toolName: inv.toolName,
          args: inv.args,
        });
      }
      rawMessages.push({ role: "assistant", content });
    } else if (msg.role === "user" && msg.toolResults && msg.toolResults.length > 0) {
      // User message with tool results - send as tool role
      // Find corresponding tool invocations to get toolName
      const toolInvocations = processedMessages
        .filter((m): m is ChatIncomingMessage & { toolInvocations: ChatToolInvocation[] } =>
          m.role === "assistant" && !!m.toolInvocations
        )
        .flatMap((m) => m.toolInvocations);

      rawMessages.push({
        role: "tool",
        content: msg.toolResults.map((r) => {
          const invocation = toolInvocations.find((inv) => inv.toolCallId === r.toolCallId);
          return {
            type: "tool-result" as const,
            toolCallId: r.toolCallId,
            toolName: invocation?.toolName ?? "unknown",
            result: r.result,
          };
        }),
      });
      // If there's also text content, add it as a separate user message
      if (msg.content) {
        rawMessages.push({ role: "user", content: msg.content });
      }
    } else if (msg.role === "user") {
      rawMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      rawMessages.push({ role: "assistant", content: msg.content });
    }
  }

  // Post-process messages:
  // 1. Ensure tool calls have corresponding tool results (add synthetic ones if missing)
  // 2. Filter out messages with empty content (except tool messages and assistant with tool calls)
  // 3. Merge consecutive user messages with timestamps

  // First pass: Find tool calls that need synthetic results
  // This handles configure_settings which doesn't have a continuation mechanism like ask_user
  const processedWithToolResults: CoreMessage[] = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    processedWithToolResults.push(msg);

    // Check if this is an assistant message with tool calls
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const toolCalls = msg.content.filter(
        (part): part is { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> } =>
          part.type === "tool-call"
      );

      if (toolCalls.length > 0) {
        // Check if the next message is a tool result
        const nextMsg = rawMessages[i + 1];
        const hasToolResult = nextMsg?.role === "tool";

        if (!hasToolResult) {
          // Add synthetic tool results for missing tool calls
          const syntheticResults = toolCalls.map((tc) => {
            let result: unknown;
            if (tc.toolName === "configure_settings") {
              // User saved settings and continued the conversation
              result = { configured: true, message: "Settings have been saved by the user." };
            } else if (tc.toolName === "ask_user") {
              // User didn't answer and sent a new message instead
              result = { skipped: true, message: "User sent a new message without answering." };
            } else {
              // Generic synthetic result for other tools
              result = { completed: true };
            }
            return {
              type: "tool-result" as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              result,
            };
          });

          processedWithToolResults.push({
            role: "tool",
            content: syntheticResults,
          });
          console.log(`[Messages] Added synthetic tool results for: ${toolCalls.map(tc => tc.toolName).join(", ")}`);
        }
      }
    }
  }

  const messages: CoreMessage[] = [];
  let pendingUserMessages: string[] = [];

  function flushPendingUserMessages(): void {
    if (pendingUserMessages.length === 0) return;

    if (pendingUserMessages.length === 1) {
      messages.push({ role: "user", content: pendingUserMessages[0] });
    } else {
      // Combine multiple user messages with timestamps
      const now = new Date();
      const combined = pendingUserMessages.map((content, idx) => {
        // Calculate approximate timestamp (subtract seconds for earlier messages)
        const msgTime = new Date(now.getTime() - (pendingUserMessages.length - 1 - idx) * 30000);
        const timeStr = msgTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        return `[${timeStr}] ${content}`;
      }).join("\n\n");
      messages.push({ role: "user", content: combined });
    }
    pendingUserMessages = [];
  }

  for (const msg of processedWithToolResults) {
    if (msg.role === "user") {
      // Skip empty user messages
      if (typeof msg.content === "string" && msg.content.trim() === "") {
        continue;
      }
      pendingUserMessages.push(msg.content as string);
    } else {
      // Flush any pending user messages before adding non-user message
      flushPendingUserMessages();

      if (msg.role === "assistant") {
        // Skip empty assistant messages (but allow those with tool calls)
        if (typeof msg.content === "string" && msg.content.trim() === "") {
          continue;
        }
        if (Array.isArray(msg.content) && msg.content.length === 0) {
          continue;
        }
      }
      messages.push(msg);
    }
  }
  // Flush any remaining user messages
  flushPendingUserMessages();

  // Debug: log final messages being sent
  console.log(`[Messages] Final count: ${messages.length}`);
  messages.forEach((m, i) => {
    const contentPreview = typeof m.content === "string"
      ? m.content.slice(0, 50)
      : Array.isArray(m.content)
        ? `[${m.content.length} parts]`
        : JSON.stringify(m.content).slice(0, 50);
    console.log(`[Messages] ${i}: ${m.role} - ${contentPreview}`);
  });

  const useTools = enableTools && Object.keys(allTools).length > 0;

  // For Ollama with tools, need /api suffix in baseURL
  let modelForRequest = aiModel;
  if (providerType === "ollama" && useTools) {
    const ollamaForTools = createOllama({ baseURL: `${ollamaBaseUrl}/api` });
    modelForRequest = ollamaForTools(model ?? "qwen3-vl:latest");
  }

  if (useTools) {
    // Manual multi-step tool execution with streaming and context trimming
    // Uses streamText for real-time text/tool streaming, with context management between steps
    const maxSteps = 10;
    let currentMessages = [...messages];
    let totalUsage = { promptTokens: 0, completionTokens: 0 };

    const encoder = new TextEncoder();

    // Create a stream that we can write to as we process steps
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Process steps in the background
    (async () => {
      try {
        // Send initial message ID
        await writer.write(encoder.encode(`f:${JSON.stringify({ messageId: `msg-${Date.now()}` })}\n`));

        for (let step = 0; step < maxSteps; step++) {
          // Log and check context size
          const msgChars = JSON.stringify(currentMessages).length;
          const toolsChars = JSON.stringify(allTools).length;
          const systemChars = systemPrompt?.length ?? 0;
          const estimatedTokens = Math.ceil((msgChars + toolsChars + systemChars) / 2);
          console.log(`[Step ${step + 1}] Messages: ${currentMessages.length} (${msgChars} chars), Est. tokens: ${estimatedTokens}`);
          // Debug: log last message to see what's being sent
          if (currentMessages.length > 0) {
            const lastMsg = currentMessages[currentMessages.length - 1];
            console.log(`[Step ${step + 1}] Last message role: ${lastMsg.role}, content preview:`,
              typeof lastMsg.content === "string" ? lastMsg.content.slice(0, 100) : JSON.stringify(lastMsg.content).slice(0, 100));
          }

          // Trim context if needed
          const maxContextTokens = 180000;
          if (estimatedTokens > maxContextTokens) {
            console.log(`[Step ${step + 1}] Context too large, trimming...`);
            while (currentMessages.length > 3) {
              const currentChars = JSON.stringify(currentMessages).length;
              const targetChars = (maxContextTokens - Math.ceil((toolsChars + systemChars) / 2)) * 2;
              if (currentChars <= targetChars) break;

              let removedPair = false;
              for (let i = 1; i < currentMessages.length - 2; i++) {
                const msg = currentMessages[i];
                if (msg.role === "assistant" && currentMessages[i + 1]?.role === "tool") {
                  currentMessages.splice(i, 2);
                  console.log(`[Step ${step + 1}] Removed tool pair at index ${i}`);
                  removedPair = true;
                  break;
                }
              }
              if (!removedPair) break;
            }
          }

          // Use streamText for real-time streaming
          const result = streamText({
            model: modelForRequest,
            messages: currentMessages,
            system: systemPrompt,
            tools: allTools,
            maxSteps: 1,
          });

          // Collect step data while streaming
          let stepText = "";
          const stepToolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = [];
          const stepToolResults: Array<{ toolCallId: string; result: unknown }> = [];

          // Stream text and tool calls as they arrive
          // Use type assertion because tools are dynamically defined and TS can't infer tool event types
          for await (const part of result.fullStream) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = part as any;
            // Debug: log all event types
            if (p.type !== "text-delta") {
              console.log(`[Step ${step + 1}] Event: ${p.type}`, p.type === "error" ? p : "");
            }
            if (p.type === "text-delta") {
              const textDelta = p.textDelta as string;
              stepText += textDelta;
              await writer.write(encoder.encode(`0:${JSON.stringify(textDelta)}\n`));
            } else if (p.type === "tool-call") {
              const toolCallId = p.toolCallId as string;
              const toolName = p.toolName as string;
              const args = p.args;
              stepToolCalls.push({ toolCallId, toolName, args });
              // Stream tool call immediately
              await writer.write(encoder.encode(`9:${JSON.stringify({
                toolCallId,
                toolName,
                args,
              })}\n`));

              // Broadcast to WebSocket if session exists
              if (threadId) {
                const session = getSessionByThread(threadId);
                if (session) {
                  broadcastToThread(threadId, {
                    type: "tool_call",
                    sessionId: session.id,
                    threadId,
                    toolCall: {
                      id: toolCallId,
                      toolName,
                      status: "calling",
                      args: args as Record<string, unknown> | undefined,
                    },
                  });
                }
              }
            } else if (p.type === "tool-result") {
              const toolCallId = p.toolCallId as string;
              // Truncate tool result before storing/streaming
              const truncatedResult = truncateToolResultForContext(p.result);
              stepToolResults.push({ toolCallId, result: truncatedResult });
              // Stream tool result immediately
              await writer.write(encoder.encode(`a:${JSON.stringify({
                toolCallId,
                result: truncatedResult,
              })}\n`));

              // Broadcast to WebSocket if session exists
              if (threadId) {
                const session = getSessionByThread(threadId);
                if (session) {
                  broadcastToThread(threadId, {
                    type: "tool_result",
                    sessionId: session.id,
                    threadId,
                    toolCall: {
                      id: toolCallId,
                      toolName: stepToolCalls.find(tc => tc.toolCallId === toolCallId)?.toolName ?? "unknown",
                      status: "done",
                      result: typeof truncatedResult === "string" ? truncatedResult : JSON.stringify(truncatedResult),
                    },
                  });
                }
              }
            } else if (p.type === "finish") {
              const usage = p.usage as { promptTokens: number; completionTokens: number } | undefined;
              if (usage) {
                totalUsage.promptTokens += usage.promptTokens;
                totalUsage.completionTokens += usage.completionTokens;
              }
            }
          }

          console.log(`[Step ${step + 1}] Completed: ${stepText.length} chars text, ${stepToolCalls.length} tool calls`);

          // Check if ask_user was called - need to pause and wait for user input
          const hasAskUser = stepToolCalls.some(tc => tc.toolName === "ask_user");
          if (hasAskUser) {
            console.log(`[Step ${step + 1}] ask_user called, pausing for user input`);
            // Don't add the tool results to messages - frontend will handle continuation
            // Just break out of the loop so frontend can show the question
            break;
          }

          // If there were tool calls, prepare for next step
          if (stepToolCalls.length > 0) {
            // Add assistant message with tool calls
            const assistantContent: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }> = [];
            if (stepText) {
              assistantContent.push({ type: "text", text: stepText });
            }
            for (const tc of stepToolCalls) {
              assistantContent.push({
                type: "tool-call",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args as Record<string, unknown>,
              });
            }
            currentMessages.push({ role: "assistant", content: assistantContent } as typeof currentMessages[number]);

            // Add truncated tool results
            currentMessages.push({
              role: "tool",
              content: stepToolResults.map((tr) => ({
                type: "tool-result" as const,
                toolCallId: tr.toolCallId,
                toolName: stepToolCalls.find((tc) => tc.toolCallId === tr.toolCallId)?.toolName ?? "unknown",
                result: tr.result,
              })),
            });

            console.log(`[Step ${step + 1}] ${stepToolCalls.length} tool calls, continuing to next step...`);
          } else {
            // No tool calls - we're done
            console.log(`[Step ${step + 1}] No tool calls, finishing`);
            break;
          }
        }

        // Send finish markers
        await writer.write(encoder.encode(`e:${JSON.stringify({
          finishReason: "stop",
          usage: totalUsage,
        })}\n`));
        await writer.write(encoder.encode(`d:${JSON.stringify({
          finishReason: "stop",
          usage: totalUsage,
        })}\n`));

      } catch (error) {
        console.error("Multi-step streaming error:", error);
        // Send error to stream
        await writer.write(encoder.encode(`3:${JSON.stringify(String(error))}\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Fallback for non-tool requests (kept for completeness but shouldn't reach here)
  if (false) {
    // This block is unreachable but kept to maintain the original error handler
    try {
      const _placeholder = null;
    } catch (error) {
      console.error("Unreachable error:", error);
      return c.json({ error: String(error) }, 500);
    }
  }

  // Standard streaming for requests without tools
  const result = streamText({
    model: aiModel,
    messages,
    maxSteps: 1,
  });

  // Stream the response
  const response = result.toDataStreamResponse();
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
});

/**
 * Generate conversation title
 */
app.post("/api/generate-title", async (c) => {
  const body = await c.req.json<{
    userMessage: string;
    assistantResponse: string;
    apiKey?: string;
    provider?: "anthropic" | "ollama";
    ollamaBaseUrl?: string;
    model?: string;
  }>();

  const {
    userMessage,
    assistantResponse,
    apiKey,
    provider: providerType = "anthropic",
    ollamaBaseUrl = "http://localhost:11434",
    model: modelName,
  } = body;

  let model: LanguageModelV1;

  if (providerType === "ollama") {
    const ollamaProvider = ollamaBaseUrl === "http://localhost:11434"
      ? ollama
      : createOllama({ baseURL: ollamaBaseUrl });
    model = ollamaProvider(modelName ?? "qwen3-vl:latest");
  } else {
    if (!apiKey) {
      return c.json({ error: "API key required for Anthropic" }, 400);
    }
    const anthropic = createAnthropic({ apiKey });
    model = anthropic(modelName ?? "claude-sonnet-4-20250514");
  }

  const result = await generateText({
    model,
    prompt: `Generate a very short title (3-5 words max) for a conversation that starts with this exchange. Reply with ONLY the title, no quotes or punctuation.

User: ${userMessage.slice(0, 200)}
Assistant: ${assistantResponse.slice(0, 200)}`,
  });

  return c.json({ title: result.text.trim() || "New conversation" });
});

// Start server
const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`Node backend starting on port ${port}...`);

// Initialize MCP servers then start HTTP server
(async () => {
  console.log("Initializing MCP servers...");
  await initializeMCPServers();
  console.log(`MCP servers initialized: ${mcpConnections.size} connected`);

  serve({
    fetch: app.fetch,
    port,
  }, (info) => {
    console.log(`Node backend running at http://localhost:${info.port}`);
  });
})();
