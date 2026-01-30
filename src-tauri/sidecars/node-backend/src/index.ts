/**
 * Node Backend Server
 *
 * Thin entry point that wires together the modular components.
 * Handles AI SDK streaming and tool execution.
 * Runs as a Tauri sidecar, communicating via HTTP.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamText, generateText, type LanguageModelV1 } from "ai";

import { HTTP_PORT, CORS_ORIGINS } from "./config.js";
import type { ChatIncomingMessage, ChatToolInvocation, EmailConfig } from "./types.js";

// Agent
import { setAgentContext, getSessionByThread } from "./agent/sessions.js";
import { createWebSocketServer, setSessionLookup } from "./agent/websocket.js";
import { broadcastToThread } from "./agent/websocket.js";

// MCP
import {
  initializeMCPServers,
  cleanupMCPServers,
  connectEmailMCPIfNeeded,
  connectFirecrawlMCPIfNeeded,
  resetEmailMCPState,
  getMCPConnections,
} from "./mcp/servers.js";
import { getMCPToolsForAISDK, truncateToolResultForContext } from "./mcp/tools.js";

// Tools
import { getBuiltinTools } from "./tools/builtin.js";
import { createPerplexityTools } from "./tools/perplexity.js";

// Chat
import { generateSystemPrompt } from "./chat/system-prompt.js";
import { createAIModel, createOllamaToolModel } from "./chat/providers.js";
import {
  getMaxContextTokens,
  truncateToolResultsInMessages,
  trimMessagesToFit,
} from "./chat/context.js";

// =============================================================================
// Initialize WebSocket (wire up session lookup to avoid circular imports)
// =============================================================================

const wss = createWebSocketServer();
setSessionLookup(getSessionByThread);

// =============================================================================
// HTTP Server
// =============================================================================

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: CORS_ORIGINS,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/health", (c) => c.json({ status: "ok" }));

// =============================================================================
// Email Test Endpoint
// =============================================================================

app.post("/api/email/test", async (c) => {
  try {
    const body = (await c.req.json()) as { emailConfig?: EmailConfig };
    const emailConfig = body.emailConfig;
    if (!emailConfig?.address || !emailConfig?.password) {
      return c.json({ success: false, error: "Email address and password are required" }, 400);
    }

    resetEmailMCPState();
    await connectEmailMCPIfNeeded(emailConfig);

    const mcpConnections = getMCPConnections();
    if (!mcpConnections.has("email")) {
      return c.json({ success: false, error: "Failed to start email server" });
    }

    const connection = mcpConnections.get("email")!;
    const errors: string[] = [];

    // Test IMAP
    const imapTool = connection.tools.has("list_emails")
      ? "list_emails"
      : connection.tools.has("fetch_emails")
        ? "fetch_emails"
        : null;
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
        const errorText = content?.find(
          (c) => c.type === "text" && c.text?.includes("Error")
        )?.text;
        if (result.isError || errorText) {
          errors.push(`IMAP: ${errorText ?? "Unknown error"}`);
        }
      } catch (err) {
        errors.push(`IMAP: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Test SMTP
    const smtpTool = connection.tools.has("send_email") ? "send_email" : null;
    if (smtpTool) {
      try {
        const schema = connection.tools.get(smtpTool)?.inputSchema;
        const required = (schema as { required?: string[] })?.required ?? [];
        const args: Record<string, unknown> = {
          subject: "AIOS Connection Test",
          body: "This is an automated connection test from AIOS Chat. You can safely delete this email.",
        };
        if (required.includes("account_name")) args.account_name = "default";
        if (required.includes("recipients")) args.recipients = [emailConfig.address];
        if (required.includes("to")) args.to = emailConfig.address;

        const result = await connection.client.callTool({ name: smtpTool, arguments: args });
        const content = result.content as Array<{ type: string; text?: string }>;
        const errorText = content?.find(
          (c) => c.type === "text" && c.text?.includes("Error")
        )?.text;
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
    return c.json({ success: false, error: String(error) });
  }
});

// =============================================================================
// Debug / Status Endpoints
// =============================================================================

app.get("/api/system-prompt", (c) => {
  const hasMCPTools = getMCPConnections().size > 0;
  return c.json({ prompt: generateSystemPrompt(true, hasMCPTools, undefined) });
});

app.get("/api/mcp/status", (c) => {
  const status: Record<string, { connected: boolean; tools: string[] }> = {};
  for (const [name, connection] of getMCPConnections()) {
    status[name] = { connected: true, tools: Array.from(connection.tools.keys()) };
  }
  return c.json({ servers: status });
});

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
    tasks: Array.from(session.tasks.values()).map((t) => ({
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
// Chat Endpoint
// =============================================================================

app.post("/api/chat", async (c) => {
  const body = await c.req.json<{
    messages: ChatIncomingMessage[];
    threadId?: string;
    apiKey?: string;
    perplexityApiKey?: string | null;
    firecrawlApiKey?: string | null;
    model?: string;
    enableTools?: boolean;
    provider?: "anthropic" | "ollama" | "redpill";
    ollamaBaseUrl?: string;
    redpillApiKey?: string;
    emailConfig?: EmailConfig;
    personality?: string;
  }>();

  const {
    messages: incomingMessages,
    threadId,
    apiKey,
    perplexityApiKey,
    firecrawlApiKey,
    model,
    enableTools = true,
    provider: providerType = "anthropic",
    ollamaBaseUrl = "http://localhost:11434",
    redpillApiKey,
    emailConfig,
    personality,
  } = body;

  // Connect email MCP if needed
  if (emailConfig?.address && emailConfig?.password) {
    await connectEmailMCPIfNeeded(emailConfig);
  }

  // Connect Firecrawl MCP if needed
  await connectFirecrawlMCPIfNeeded(firecrawlApiKey);

  // Set agent context for tool execution
  setAgentContext({ threadId, apiKey, perplexityApiKey });

  // Create AI model
  const effectiveApiKey = providerType === "redpill" ? redpillApiKey : apiKey;
  let aiModel: LanguageModelV1;
  try {
    aiModel = createAIModel(providerType, effectiveApiKey, ollamaBaseUrl, model);
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }

  // Build tools
  const perplexityTools = createPerplexityTools(perplexityApiKey);
  const mcpTools = getMCPToolsForAISDK();
  const hasMCPTools = Object.keys(mcpTools).length > 0;

  const allTools = enableTools
    ? {
        ...getBuiltinTools(),
        ...perplexityTools,
        ...mcpTools,
      }
    : {};

  const systemPrompt = generateSystemPrompt(!!perplexityApiKey, hasMCPTools, personality);

  // Context management
  const willUseTools = enableTools && Object.keys(allTools).length > 0;
  const maxTokens = getMaxContextTokens(providerType, model);
  const modelName =
    model ?? (providerType === "ollama" ? "qwen3-vl:latest" : "claude-sonnet-4-20250514");

  console.log(
    `[Context] Provider: ${providerType}, Model: ${modelName}, Tools: ${willUseTools}, Max tokens: ${maxTokens}`
  );

  const maxToolResultChars = Math.floor((maxTokens * 3.5) / 4);
  const truncatedIncoming = truncateToolResultsInMessages(incomingMessages, maxToolResultChars);

  const toolsJson = willUseTools ? JSON.stringify(allTools) : "";
  const toolsOverheadTokens = Math.ceil(toolsJson.length / 2);
  console.log(
    `[Context] Tools JSON size: ${toolsJson.length} chars, estimated overhead: ${toolsOverheadTokens} tokens`
  );

  const processedMessages = await trimMessagesToFit(
    truncatedIncoming,
    providerType,
    modelName,
    apiKey,
    willUseTools ? systemPrompt : undefined,
    maxTokens,
    toolsOverheadTokens
  );

  // Convert to CoreMessage format
  type CoreMessage =
    | { role: "user"; content: string }
    | {
        role: "assistant";
        content:
          | string
          | Array<
              | { type: "text"; text: string }
              | {
                  type: "tool-call";
                  toolCallId: string;
                  toolName: string;
                  args: Record<string, unknown>;
                }
            >;
      }
    | {
        role: "tool";
        content: Array<{
          type: "tool-result";
          toolCallId: string;
          toolName: string;
          result: unknown;
        }>;
      };

  const rawMessages: CoreMessage[] = [];

  for (const msg of processedMessages) {
    if (msg.role === "assistant" && msg.toolInvocations && msg.toolInvocations.length > 0) {
      const content: Array<
        | { type: "text"; text: string }
        | {
            type: "tool-call";
            toolCallId: string;
            toolName: string;
            args: Record<string, unknown>;
          }
      > = [];
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
      const toolInvocations = processedMessages
        .filter(
          (m): m is ChatIncomingMessage & { toolInvocations: ChatToolInvocation[] } =>
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
      if (msg.content) {
        rawMessages.push({ role: "user", content: msg.content });
      }
    } else if (msg.role === "user") {
      rawMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      rawMessages.push({ role: "assistant", content: msg.content });
    }
  }

  // Post-process: add synthetic tool results for missing ones
  const processedWithToolResults: CoreMessage[] = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const msg = rawMessages[i];
    processedWithToolResults.push(msg);

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const toolCalls = msg.content.filter(
        (
          part
        ): part is {
          type: "tool-call";
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
        } => part.type === "tool-call"
      );

      if (toolCalls.length > 0) {
        const nextMsg = rawMessages[i + 1];
        if (nextMsg?.role !== "tool") {
          const syntheticResults = toolCalls.map((tc) => {
            let result: unknown;
            if (tc.toolName === "configure_settings") {
              result = { configured: true, message: "Settings have been saved by the user." };
            } else if (tc.toolName === "ask_user") {
              result = { skipped: true, message: "User sent a new message without answering." };
            } else {
              result = { completed: true };
            }
            return {
              type: "tool-result" as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              result,
            };
          });

          processedWithToolResults.push({ role: "tool", content: syntheticResults });
          console.log(
            `[Messages] Added synthetic tool results for: ${toolCalls.map((tc) => tc.toolName).join(", ")}`
          );
        }
      }
    }
  }

  // Merge consecutive user messages
  const messages: CoreMessage[] = [];
  let pendingUserMessages: string[] = [];

  function flushPendingUserMessages(): void {
    if (pendingUserMessages.length === 0) return;

    if (pendingUserMessages.length === 1) {
      messages.push({ role: "user", content: pendingUserMessages[0] });
    } else {
      const now = new Date();
      const combined = pendingUserMessages
        .map((content, idx) => {
          const msgTime = new Date(
            now.getTime() - (pendingUserMessages.length - 1 - idx) * 30000
          );
          const timeStr = msgTime.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return `[${timeStr}] ${content}`;
        })
        .join("\n\n");
      messages.push({ role: "user", content: combined });
    }
    pendingUserMessages = [];
  }

  for (const msg of processedWithToolResults) {
    if (msg.role === "user") {
      if (typeof msg.content === "string" && msg.content.trim() === "") continue;
      pendingUserMessages.push(msg.content as string);
    } else {
      flushPendingUserMessages();
      if (msg.role === "assistant") {
        if (typeof msg.content === "string" && msg.content.trim() === "") continue;
        if (Array.isArray(msg.content) && msg.content.length === 0) continue;
      }
      messages.push(msg);
    }
  }
  flushPendingUserMessages();

  // Debug log
  console.log(`[Messages] Final count: ${messages.length}`);
  messages.forEach((m, i) => {
    const contentPreview =
      typeof m.content === "string"
        ? m.content.slice(0, 50)
        : Array.isArray(m.content)
          ? `[${m.content.length} parts]`
          : JSON.stringify(m.content).slice(0, 50);
    console.log(`[Messages] ${i}: ${m.role} - ${contentPreview}`);
  });

  const useTools = enableTools && Object.keys(allTools).length > 0;

  let modelForRequest = aiModel;
  if (providerType === "ollama" && useTools) {
    modelForRequest = createOllamaToolModel(ollamaBaseUrl, model);
  }

  // Single-pass streaming with NDJSON protocol
  // Frontend drives the tool loop by sending follow-up requests when hasToolCalls is true
  const result = streamText({
    model: modelForRequest,
    messages,
    ...(useTools ? { system: systemPrompt, tools: allTools } : {}),
    maxSteps: 1,
  });

  const totalUsage = { promptTokens: 0, completionTokens: 0 };
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = [];

  (async () => {
    try {
      for await (const part of result.fullStream) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = part as any;

        if (p.type === "text-delta") {
          const textDelta = p.textDelta as string;
          await writer.write(
            encoder.encode(JSON.stringify({ type: "text", content: textDelta }) + "\n")
          );
        } else if (p.type === "reasoning") {
          const reasoning = p.textDelta as string;
          await writer.write(
            encoder.encode(JSON.stringify({ type: "thinking", content: reasoning }) + "\n")
          );
        } else if (p.type === "tool-call") {
          const toolCallId = p.toolCallId as string;
          const toolName = p.toolName as string;
          const args = p.args;
          toolCalls.push({ toolCallId, toolName, args });
          await writer.write(
            encoder.encode(
              JSON.stringify({ type: "tool_call", id: toolCallId, name: toolName, args }) + "\n"
            )
          );

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
          const truncatedResult = truncateToolResultForContext(p.result);
          await writer.write(
            encoder.encode(
              JSON.stringify({ type: "tool_result", id: toolCallId, result: truncatedResult }) + "\n"
            )
          );

          if (threadId) {
            const session = getSessionByThread(threadId);
            if (session) {
              broadcastToThread(threadId, {
                type: "tool_result",
                sessionId: session.id,
                threadId,
                toolCall: {
                  id: toolCallId,
                  toolName:
                    toolCalls.find((tc) => tc.toolCallId === toolCallId)?.toolName ?? "unknown",
                  status: "done",
                  result:
                    typeof truncatedResult === "string"
                      ? truncatedResult
                      : JSON.stringify(truncatedResult),
                },
              });
            }
          }
        } else if (p.type === "finish") {
          const usage = p.usage as
            | { promptTokens: number; completionTokens: number }
            | undefined;
          if (usage) {
            totalUsage.promptTokens += usage.promptTokens;
            totalUsage.completionTokens += usage.completionTokens;
          }
        } else if (p.type === "error") {
          console.error("[Stream] Error event:", p);
          await writer.write(
            encoder.encode(JSON.stringify({ type: "error", message: String(p.error ?? p) }) + "\n")
          );
        }
      }

      const hasToolCalls = toolCalls.length > 0;
      console.log(
        `[Stream] Completed: ${toolCalls.length} tool calls, hasToolCalls: ${hasToolCalls}`
      );

      await writer.write(
        encoder.encode(
          JSON.stringify({ type: "end", hasToolCalls, usage: totalUsage }) + "\n"
        )
      );
    } catch (error) {
      console.error("Streaming error:", error);
      // Extract user-friendly message from API errors
      let errorMessage = String(error);
      const err = error as Record<string, unknown>;
      if (err.responseBody && typeof err.responseBody === "string") {
        try {
          const body = JSON.parse(err.responseBody) as { error?: { message?: string } };
          if (body.error?.message) {
            errorMessage = body.error.message;
          }
        } catch {
          // use default
        }
      }
      if (err.statusCode === 402) {
        errorMessage = "Account quota exceeded. Please add credits at your provider dashboard to continue.";
      }
      await writer.write(
        encoder.encode(JSON.stringify({ type: "error", message: errorMessage }) + "\n")
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// =============================================================================
// Title Generation
// =============================================================================

app.post("/api/generate-title", async (c) => {
  const body = await c.req.json<{
    userMessage: string;
    assistantResponse: string;
    apiKey?: string;
    provider?: "anthropic" | "ollama" | "redpill";
    ollamaBaseUrl?: string;
    redpillApiKey?: string;
    model?: string;
  }>();

  const {
    userMessage,
    assistantResponse,
    apiKey,
    provider: providerType = "anthropic",
    ollamaBaseUrl = "http://localhost:11434",
    redpillApiKey: titleRedpillApiKey,
    model: modelName,
  } = body;

  const titleEffectiveApiKey = providerType === "redpill" ? titleRedpillApiKey : apiKey;
  let model: LanguageModelV1;
  try {
    model = createAIModel(providerType, titleEffectiveApiKey, ollamaBaseUrl, modelName);
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }

  const result = await generateText({
    model,
    prompt: `Generate a very short title (3-5 words max) for a conversation that starts with this exchange. Reply with ONLY the title, no quotes or punctuation.

User: ${userMessage.slice(0, 200)}
Assistant: ${assistantResponse.slice(0, 200)}`,
  });

  return c.json({ title: result.text.trim() || "New conversation" });
});

// =============================================================================
// Graceful Shutdown
// =============================================================================

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
// Startup
// =============================================================================

console.log(`Node backend starting on port ${HTTP_PORT}...`);

(async () => {
  console.log("Initializing MCP servers...");
  await initializeMCPServers();
  console.log(`MCP servers initialized: ${getMCPConnections().size} connected`);

  serve(
    { fetch: app.fetch, port: HTTP_PORT },
    (info) => {
      console.log(`Node backend running at http://localhost:${info.port}`);
    }
  );
})();
