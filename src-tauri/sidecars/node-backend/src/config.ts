/**
 * Configuration constants
 */

export const HTTP_PORT = parseInt(process.env.PORT ?? "3001", 10);
export const WS_PORT = parseInt(process.env.WS_PORT ?? "3002", 10);

/** Max chars per individual tool result to prevent context overflow (~4k tokens) */
export const MAX_TOOL_RESULT_CHARS = 8000;

/** CORS allowed origins */
export const CORS_ORIGINS = ["http://localhost:1420", "tauri://localhost"];
