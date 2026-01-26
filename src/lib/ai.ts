/**
 * AI Provider - Calls Node backend for AI functionality
 *
 * The Node backend handles AI SDK streaming and MCP server connections.
 * This keeps the frontend simple and avoids bundling Node.js-only code.
 */
import type { ToolInvocation } from "@app/types/message";

// Re-export ToolInvocation type
export type { ToolInvocation };

// Node backend URL - configurable for development vs production
const NODE_BACKEND_URL = "http://localhost:3001";

// API key storage - Anthropic
export function setApiKey(key: string): void {
  localStorage.setItem("anthropic_api_key", key);
}

export function getApiKey(): string | null {
  return localStorage.getItem("anthropic_api_key");
}

// API key storage - Perplexity
export function setPerplexityApiKey(key: string): void {
  localStorage.setItem("perplexity_api_key", key);
}

export function getPerplexityApiKey(): string | null {
  return localStorage.getItem("perplexity_api_key");
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ToolInvocation[];
}

export interface StreamResult {
  text: string;
  toolInvocations: ToolInvocation[];
}

/**
 * Parse AI SDK data stream format
 *
 * The AI SDK streams data in a specific format:
 * - Text chunks: 0:"text content"
 * - Tool calls: 9:{...tool call data...}
 * - Tool results: a:{...tool result data...}
 * - Finish: d:{...finish data...}
 */
function parseDataStreamLine(line: string): {
  type: "text" | "tool-call" | "tool-result" | "finish" | "error" | "unknown";
  data: unknown;
} {
  if (line.length === 0) {
    return { type: "unknown", data: null };
  }

  // Format is: TYPE:DATA where TYPE is a single character
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return { type: "unknown", data: line };
  }

  const typeChar = line.slice(0, colonIndex);
  const dataStr = line.slice(colonIndex + 1);

  switch (typeChar) {
    case "0": // Text chunk
      try {
        return { type: "text", data: JSON.parse(dataStr) as string };
      } catch {
        return { type: "text", data: dataStr };
      }

    case "9": // Tool call
      try {
        return { type: "tool-call", data: JSON.parse(dataStr) };
      } catch {
        return { type: "unknown", data: dataStr };
      }

    case "a": // Tool result
      try {
        return { type: "tool-result", data: JSON.parse(dataStr) };
      } catch {
        return { type: "unknown", data: dataStr };
      }

    case "d": // Finish
      try {
        return { type: "finish", data: JSON.parse(dataStr) };
      } catch {
        return { type: "unknown", data: dataStr };
      }

    case "3": // Error
      try {
        return { type: "error", data: JSON.parse(dataStr) };
      } catch {
        return { type: "error", data: dataStr };
      }

    default:
      return { type: "unknown", data: dataStr };
  }
}

/**
 * Stream a chat response from the Node backend
 */
export async function streamChatResponse(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onToolInvocation?: (invocation: ToolInvocation) => void,
  enableTools = true
): Promise<StreamResult> {
  const apiKey = getApiKey();
  if (apiKey === null || apiKey === "") {
    throw new Error("API key not set. Please add it in settings.");
  }

  const perplexityApiKey = getPerplexityApiKey();

  const response = await fetch(`${NODE_BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      apiKey,
      perplexityApiKey,
      enableTools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${error}`);
  }

  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let fullText = "";
  const toolInvocations: ToolInvocation[] = [];
  const toolCallsInProgress = new Map<string, Partial<ToolInvocation>>();

  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const parsed = parseDataStreamLine(line);

      switch (parsed.type) {
        case "text":
          if (typeof parsed.data === "string") {
            fullText += parsed.data;
            onChunk(parsed.data);
          }
          break;

        case "tool-call": {
          const toolCall = parsed.data as {
            toolCallId: string;
            toolName: string;
            args: Record<string, unknown>;
          };
          const callInvocation: ToolInvocation = {
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            args: toolCall.args,
            state: "call",
          };
          toolCallsInProgress.set(toolCall.toolCallId, callInvocation);
          // Emit tool call immediately so UI can show loading state
          onToolInvocation?.(callInvocation);
          break;
        }

        case "tool-result": {
          const toolResult = parsed.data as {
            toolCallId: string;
            result: unknown;
          };
          const existing = toolCallsInProgress.get(toolResult.toolCallId);
          if (existing !== undefined) {
            const resultInvocation: ToolInvocation = {
              toolCallId: existing.toolCallId ?? toolResult.toolCallId,
              toolName: existing.toolName ?? "unknown",
              args: existing.args ?? {},
              state: "result",
              result: toolResult.result,
            };
            toolInvocations.push(resultInvocation);
            toolCallsInProgress.delete(toolResult.toolCallId);
            // Emit completed tool invocation
            onToolInvocation?.(resultInvocation);
          }
          break;
        }
      }
    }
  }

  // Process any remaining buffer
  if (buffer.length > 0) {
    const parsed = parseDataStreamLine(buffer);
    if (parsed.type === "text" && typeof parsed.data === "string") {
      fullText += parsed.data;
      onChunk(parsed.data);
    }
  }

  return { text: fullText, toolInvocations };
}

/**
 * Generate a conversation title from the first exchange
 */
export async function generateConversationTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string> {
  const apiKey = getApiKey();
  if (apiKey === null || apiKey === "") {
    throw new Error("API key not set");
  }

  const response = await fetch(`${NODE_BACKEND_URL}/api/generate-title`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userMessage,
      assistantResponse,
      apiKey,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate title");
  }

  const data = await response.json() as { title: string };
  return data.title;
}
