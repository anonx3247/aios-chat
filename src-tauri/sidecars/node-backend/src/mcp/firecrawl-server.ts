/**
 * Firecrawl MCP Server
 *
 * In-process MCP server providing web fetch and search via Firecrawl API.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl";

export function createFirecrawlServer(apiKey: string): McpServer {
  const server = new McpServer({
    name: "firecrawl",
    version: "0.1.0",
  });

  const firecrawl = new Firecrawl({ apiKey });

  server.tool(
    "fetch",
    "Returns Markdown-formatted content of a webpage at the given URL.",
    {
      url: z.string().describe("The URL of the webpage to fetch."),
      offset: z
        .number()
        .describe("Character offset into the content (default: 0).")
        .default(0),
      length: z
        .number()
        .describe("Max characters to return (max 8196, default 8196).")
        .default(8196),
    },
    async ({ url, offset, length }: { url: string; offset: number; length: number }) => {
      if (length > 8196) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Length ${length} exceeds max of 8196.` }],
        };
      }

      try {
        const doc = await firecrawl.scrape(url, { formats: ["markdown"] });
        const text = doc.markdown
          ? doc.markdown.slice(offset, offset + length)
          : "";
        return { isError: false, content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Fetch error: ${String(error)}` }],
        };
      }
    }
  );

  server.tool(
    "search",
    "Returns a list of web search results for the query.",
    {
      query: z.string().describe("The search query."),
      count: z
        .number()
        .describe("Number of results to return (max 20, default 10).")
        .default(10),
    },
    async ({ query, count }: { query: string; count: number }) => {
      if (count > 20) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Count ${count} exceeds max of 20.` }],
        };
      }

      try {
        const response = await firecrawl.search(query, { limit: count });
        const webResults = response.web ?? [];
        let results = "";
        for (const [i, res] of webResults.entries()) {
          const r = res as { title?: string; url?: string; description?: string };
          results += `${i + 1}. [${r.title ?? "Untitled"}](${r.url ?? ""})\n${r.description ?? ""}\n\n`;
        }
        return { isError: false, content: [{ type: "text" as const, text: results }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Search error: ${String(error)}` }],
        };
      }
    }
  );

  return server;
}
