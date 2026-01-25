/**
 * Node Backend Server
 *
 * Handles AI SDK streaming and MCP server connections.
 * Runs as a Tauri sidecar, communicating via HTTP.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamText, generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { dynamicUITools, generateSystemPrompt } from "dynamic-ui-mcp/tools";

const app = new Hono();

// Enable CORS for frontend
app.use("/*", cors({
  origin: ["http://localhost:1420", "tauri://localhost"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Get system prompt (for debugging/inspection)
app.get("/api/system-prompt", (c) => {
  const prompt = generateSystemPrompt();
  return c.json({ prompt });
});

/**
 * Stream chat response
 */
app.post("/api/chat", async (c) => {
  const body = await c.req.json<{
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    apiKey: string;
    model?: string;
    enableTools?: boolean;
  }>();

  const { messages, apiKey, model = "claude-sonnet-4-20250514", enableTools = true } = body;

  if (!apiKey) {
    return c.json({ error: "API key required" }, 400);
  }

  const provider = createAnthropic({ apiKey });
  const aiModel = provider(model);

  const systemPrompt = generateSystemPrompt();

  const result = streamText({
    model: aiModel,
    messages,
    maxSteps: 5,
    ...(enableTools ? { system: systemPrompt, tools: dynamicUITools } : {}),
  });

  // Stream the response using AI SDK's data stream
  const response = result.toDataStreamResponse();

  // Copy headers and body to Hono response
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
    apiKey: string;
  }>();

  const { userMessage, assistantResponse, apiKey } = body;

  if (!apiKey) {
    return c.json({ error: "API key required" }, 400);
  }

  const provider = createAnthropic({ apiKey });
  const model = provider("claude-sonnet-4-20250514");

  const result = await generateText({
    model,
    prompt: `Generate a very short title (3-5 words max) for a conversation that starts with this exchange. Reply with ONLY the title, no quotes or punctuation.

User: ${userMessage.slice(0, 200)}
Assistant: ${assistantResponse.slice(0, 200)}`,
  });

  return c.json({ title: result.text.trim() || "New conversation" });
});

// Get port from environment or use default
const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`Node backend starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Node backend running at http://localhost:${info.port}`);
});
