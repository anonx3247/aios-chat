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
  await cleanupMCPServers();
  process.exit(0);
});

process.on("SIGTERM", async () => {
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

### Content Embedding
- **embed**: Display rich media inline in the chat
  - YouTube videos (youtube.com, youtu.be)
  - Spotify tracks/playlists/albums (open.spotify.com)
  - Google Maps locations and directions (google.com/maps)
  - Social media posts (Twitter/X, Instagram, TikTok, Facebook, LinkedIn)
  - Use when sharing relevant videos, music, maps, or social content`;

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
- **time_convert_time**: Convert time between timezones`;
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
    apiKey?: string;
    perplexityApiKey?: string | null;
    model?: string;
    enableTools?: boolean;
    provider?: "anthropic" | "ollama";
    ollamaBaseUrl?: string;
  }>();

  const {
    messages: incomingMessages,
    apiKey,
    perplexityApiKey,
    model,
    enableTools = true,
    provider: providerType = "anthropic",
    ollamaBaseUrl = "http://localhost:11434",
  } = body;

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
  const messages: Array<
    | { role: "user"; content: string }
    | { role: "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }> }
    | { role: "tool"; content: Array<{ type: "tool-result"; toolCallId: string; toolName: string; result: unknown }> }
  > = [];

  for (const msg of processedMessages) {
    if (msg.role === "assistant" && msg.toolInvocations && msg.toolInvocations.length > 0) {
      // Assistant message with tool calls
      const content: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }> = [];
      if (msg.content) {
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
      messages.push({ role: "assistant", content });
    } else if (msg.role === "user" && msg.toolResults && msg.toolResults.length > 0) {
      // User message with tool results - send as tool role
      // Find corresponding tool invocations to get toolName
      const toolInvocations = processedMessages
        .filter((m): m is ChatIncomingMessage & { toolInvocations: ChatToolInvocation[] } =>
          m.role === "assistant" && !!m.toolInvocations
        )
        .flatMap((m) => m.toolInvocations);

      messages.push({
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
        messages.push({ role: "user", content: msg.content });
      }
    } else if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

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
            } else if (p.type === "finish") {
              const usage = p.usage as { promptTokens: number; completionTokens: number } | undefined;
              if (usage) {
                totalUsage.promptTokens += usage.promptTokens;
                totalUsage.completionTokens += usage.completionTokens;
              }
            }
          }

          console.log(`[Step ${step + 1}] Completed: ${stepText.length} chars text, ${stepToolCalls.length} tool calls`);

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
