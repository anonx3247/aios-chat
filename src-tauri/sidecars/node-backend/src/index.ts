/**
 * Node Backend Server
 *
 * Handles AI SDK streaming and MCP server connections.
 * Runs as a Tauri sidecar, communicating via HTTP.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamText, generateText, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { dynamicUITools, generateSystemPrompt } from "dynamic-ui-mcp/tools";
import { z } from "zod";

/**
 * Create Perplexity tools for web search and research
 */
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
      description: "Ask Perplexity for quick answers with real-time web search. Best for quick questions, everyday searches, and conversational queries that benefit from web context.",
      parameters: z.object({
        query: z.string().describe("The question or query to ask Perplexity"),
      }),
      execute: async ({ query }) => {
        const result = await callPerplexity("sonar", query);
        return {
          answer: result.content,
          citations: result.citations,
        };
      },
    }),

    perplexity_research: tool({
      description: "Deep, comprehensive research using Perplexity. Provides thorough analysis with citations. Best for complex topics requiring detailed investigation.",
      parameters: z.object({
        query: z.string().describe("The research topic or question"),
      }),
      execute: async ({ query }) => {
        const result = await callPerplexity("sonar-pro", query);
        return {
          research: result.content,
          citations: result.citations,
        };
      },
    }),

    perplexity_reason: tool({
      description: "Advanced reasoning and problem-solving using Perplexity's reasoning model. Best for logical problems, complex analysis, and step-by-step reasoning.",
      parameters: z.object({
        query: z.string().describe("The problem or question requiring reasoning"),
      }),
      execute: async ({ query }) => {
        const result = await callPerplexity("sonar-reasoning", query);
        return {
          reasoning: result.content,
          citations: result.citations,
        };
      },
    }),
  };
}

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
    perplexityApiKey?: string | null;
    model?: string;
    enableTools?: boolean;
  }>();

  const { messages, apiKey, perplexityApiKey, model = "claude-sonnet-4-20250514", enableTools = true } = body;

  if (!apiKey) {
    return c.json({ error: "API key required" }, 400);
  }

  const provider = createAnthropic({ apiKey });
  const aiModel = provider(model);

  const systemPrompt = generateSystemPrompt();

  // Combine dynamic UI tools with Perplexity tools
  const perplexityTools = createPerplexityTools(perplexityApiKey);
  const allTools = enableTools ? { ...dynamicUITools, ...perplexityTools } : {};

  // Build enhanced system prompt if Perplexity is available
  let enhancedSystemPrompt = systemPrompt;
  if (perplexityApiKey && enableTools) {
    enhancedSystemPrompt += `\n\n## Web Search Tools\nYou have access to Perplexity web search tools:\n- perplexity_ask: For quick questions and current information\n- perplexity_research: For in-depth research on complex topics\n- perplexity_reason: For logical problems requiring step-by-step reasoning\n\nUse these tools when the user asks about current events, needs web research, or asks questions that require up-to-date information.`;
  }

  const result = streamText({
    model: aiModel,
    messages,
    maxSteps: 5,
    ...(enableTools ? { system: enhancedSystemPrompt, tools: allTools } : {}),
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
