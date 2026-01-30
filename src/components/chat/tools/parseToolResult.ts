/**
 * Parse a tool invocation result which may be a JSON string or an object.
 *
 * The backend's truncateToolResultForContext() stringifies all tool results,
 * so results arrive as strings on the frontend. This helper handles both cases.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function parseToolResult<T>(result: unknown): T | undefined {
  if (result === null || result === undefined) return undefined;
  if (typeof result === "object") return result as T;
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
