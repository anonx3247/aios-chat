/**
 * MCP Tool Conversion
 *
 * Converts MCP tools to AI SDK format with JSON Schema → Zod conversion.
 */
import { tool, type CoreTool } from "ai";
import { z, type ZodTypeAny } from "zod";
import { MAX_TOOL_RESULT_CHARS } from "../config.js";
import { getMCPConnections } from "./servers.js";

/**
 * Convert JSON Schema to Zod schema
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): ZodTypeAny {
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
 * Truncate a tool result to prevent context overflow
 */
export function truncateToolResultForContext(result: unknown): string {
  if (result === null || result === undefined) {
    return String(result);
  }

  const resultStr = typeof result === "string" ? result : JSON.stringify(result);

  if (resultStr.length <= MAX_TOOL_RESULT_CHARS) {
    console.log(`[Tools] Result OK: ${resultStr.length} chars`);
    return resultStr;
  }

  console.log(`[Tools] TRUNCATING: ${resultStr.length} chars -> ${MAX_TOOL_RESULT_CHARS} chars`);

  const notice = "\n\n[... content truncated: was " + resultStr.length + " chars ...]\n\n";
  const availableChars = MAX_TOOL_RESULT_CHARS - notice.length;
  const firstPartSize = Math.floor(availableChars * 0.7);
  const lastPartSize = availableChars - firstPartSize;

  const firstPart = resultStr.slice(0, firstPartSize);
  const lastPart = resultStr.slice(-lastPartSize);

  const truncated = firstPart + notice + lastPart;
  console.log(`[Tools] Truncated result size: ${truncated.length} chars`);
  return truncated;
}

/**
 * Convert all connected MCP tools to AI SDK tool format
 */
export function getMCPToolsForAISDK(): Record<string, CoreTool> {
  const aiTools: Record<string, CoreTool> = {};
  const mcpConnections = getMCPConnections();

  for (const [serverName, connection] of mcpConnections) {
    for (const [toolName, toolInfo] of connection.tools) {
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
