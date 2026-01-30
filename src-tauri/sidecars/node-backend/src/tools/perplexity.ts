/**
 * Perplexity Tools
 *
 * Web search, research, and reasoning via Perplexity API.
 */
import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { truncateToolResultForContext } from "../mcp/tools.js";

export function createPerplexityTools(
  apiKey: string | null | undefined
): Record<string, CoreTool> {
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
        Authorization: `Bearer ${apiKey}`,
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

    const data = (await response.json()) as {
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
      description:
        "Quick web search for current information. Returns concise answers with source citations. Best for quick questions, facts, and current events.",
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
      description:
        "Deep research on complex topics. Provides comprehensive analysis with detailed citations. Best for in-depth investigation and thorough understanding.",
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
      description:
        "Advanced reasoning and analysis. Provides step-by-step logical reasoning with citations. Best for complex problems requiring structured thinking.",
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
