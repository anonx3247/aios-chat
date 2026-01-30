/**
 * AI Provider - Calls Node backend for AI functionality
 *
 * The Node backend handles AI SDK streaming and MCP server connections.
 * This keeps the frontend simple and avoids bundling Node.js-only code.
 *
 * Sensitive credentials (API keys) are stored in OS-native secure storage.
 * Non-sensitive settings (provider, model names, URLs) are in localStorage.
 */
import type { ToolInvocation } from "@app/types/message";
import {
  getCredentialWithFallback,
  setCredentialWithFallback,
  getAllCredentialsWithFallback,
  type CredentialKey,
} from "./credentials";

// Re-export ToolInvocation type
export type { ToolInvocation };

// Node backend URL - configurable for development vs production
const NODE_BACKEND_URL = "http://localhost:3001";

// Provider types
export type AIProvider = "anthropic" | "ollama";

export interface ProviderConfig {
  provider: AIProvider;
  anthropicApiKey: string | undefined;
  perplexityApiKey: string | undefined;
  ollamaBaseUrl: string;
  ollamaModel: string;
  enableTools: boolean;
}

export interface EmailConfig {
  emailAddress: string | undefined;
  emailUsername: string | undefined;
  emailPassword: string | undefined;
  emailImapHost: string | undefined;
  emailImapPort: string | undefined;
  emailImapSecurity: string | undefined;
  emailSmtpHost: string | undefined;
  emailSmtpPort: string | undefined;
  emailSmtpSecurity: string | undefined;
  emailSslVerify: string | undefined;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3-vl:latest";

// ============================================================================
// Non-sensitive settings (localStorage)
// ============================================================================

export function setProvider(provider: AIProvider): void {
  localStorage.setItem("ai_provider", provider);
}

export function getProvider(): AIProvider {
  const stored = localStorage.getItem("ai_provider");
  return stored !== null ? (stored as AIProvider) : "ollama";
}

export function setOllamaBaseUrl(url: string): void {
  localStorage.setItem("ollama_base_url", url);
}

export function getOllamaBaseUrl(): string {
  return localStorage.getItem("ollama_base_url") ?? DEFAULT_OLLAMA_URL;
}

export function setOllamaModel(model: string): void {
  localStorage.setItem("ollama_model", model);
}

export function getOllamaModel(): string {
  return localStorage.getItem("ollama_model") ?? DEFAULT_OLLAMA_MODEL;
}

export function setEnableTools(enabled: boolean): void {
  localStorage.setItem("enable_tools", enabled ? "true" : "false");
}

export function getEnableTools(): boolean {
  const stored = localStorage.getItem("enable_tools");
  if (stored === null) {
    // Default: enabled for Anthropic, disabled for Ollama
    return getProvider() === "anthropic";
  }
  return stored === "true";
}

// ============================================================================
// Sensitive credentials (secure storage)
// ============================================================================

// API key storage - Anthropic
export async function setApiKey(key: string): Promise<void> {
  await setCredentialWithFallback("anthropic_api_key", key);
}

export async function getApiKey(): Promise<string | null> {
  return getCredentialWithFallback("anthropic_api_key");
}

// API key storage - Perplexity
export async function setPerplexityApiKey(key: string): Promise<void> {
  await setCredentialWithFallback("perplexity_api_key", key);
}

export async function getPerplexityApiKey(): Promise<string | null> {
  return getCredentialWithFallback("perplexity_api_key");
}

// Email credentials
export async function setEmailCredential(
  key: Extract<CredentialKey, `email_${string}`>,
  value: string
): Promise<void> {
  await setCredentialWithFallback(key, value);
}

export async function getEmailCredential(
  key: Extract<CredentialKey, `email_${string}`>
): Promise<string | null> {
  return getCredentialWithFallback(key);
}

// ============================================================================
// Provider configuration (combines localStorage + secure storage)
// ============================================================================

/**
 * Get provider configuration - async because it reads from secure storage
 */
export async function getProviderConfigAsync(): Promise<ProviderConfig> {
  const provider = getProvider();
  const [anthropicApiKey, perplexityApiKey] = await Promise.all([
    getApiKey(),
    getPerplexityApiKey(),
  ]);

  return {
    provider,
    anthropicApiKey: anthropicApiKey ?? undefined,
    perplexityApiKey: perplexityApiKey ?? undefined,
    ollamaBaseUrl: getOllamaBaseUrl(),
    ollamaModel: getOllamaModel(),
    // Default: tools enabled for Anthropic, disabled for Ollama (not all models support it)
    enableTools:
      localStorage.getItem("enable_tools") === "true" ||
      (localStorage.getItem("enable_tools") === null && provider === "anthropic"),
  };
}

/**
 * Get email configuration from secure storage
 */
export async function getEmailConfigAsync(): Promise<EmailConfig> {
  const credentials = await getAllCredentialsWithFallback();
  return {
    emailAddress: credentials.email_address ?? undefined,
    emailUsername: credentials.email_username ?? undefined,
    emailPassword: credentials.email_password ?? undefined,
    emailImapHost: credentials.email_imap_host ?? undefined,
    emailImapPort: credentials.email_imap_port ?? undefined,
    emailImapSecurity: credentials.email_imap_security ?? undefined,
    emailSmtpHost: credentials.email_smtp_host ?? undefined,
    emailSmtpPort: credentials.email_smtp_port ?? undefined,
    emailSmtpSecurity: credentials.email_smtp_security ?? undefined,
    emailSslVerify: credentials.email_ssl_verify ?? undefined,
  };
}

/**
 * Synchronous provider config - DEPRECATED, use getProviderConfigAsync
 * Only returns non-sensitive settings; API keys will be undefined
 */
export function getProviderConfig(): Omit<ProviderConfig, "anthropicApiKey" | "perplexityApiKey"> & {
  anthropicApiKey: undefined;
  perplexityApiKey: undefined;
} {
  const provider = getProvider();
  return {
    provider,
    anthropicApiKey: undefined,
    perplexityApiKey: undefined,
    ollamaBaseUrl: getOllamaBaseUrl(),
    ollamaModel: getOllamaModel(),
    enableTools:
      localStorage.getItem("enable_tools") === "true" ||
      (localStorage.getItem("enable_tools") === null && provider === "anthropic"),
  };
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ToolInvocation[];
  toolResults?: ToolResult[]; // For passing tool results back to the model
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
  enableTools = true,
  threadId?: string
): Promise<StreamResult> {
  const config = await getProviderConfigAsync();
  const emailConfig = await getEmailConfigAsync();

  // Validate config based on provider
  if (config.provider === "anthropic" && (config.anthropicApiKey === undefined || config.anthropicApiKey === "")) {
    throw new Error("Anthropic API key not set. Please add it in settings.");
  }

  // Format messages for the API, including tool invocations and results
  const formattedMessages = messages.map((m) => {
    const msg: {
      role: "user" | "assistant";
      content: string;
      toolInvocations?: ToolInvocation[];
      toolResults?: ToolResult[];
    } = { role: m.role, content: m.content };
    if (m.toolInvocations !== undefined && m.toolInvocations.length > 0) {
      msg.toolInvocations = m.toolInvocations;
    }
    if (m.toolResults !== undefined && m.toolResults.length > 0) {
      msg.toolResults = m.toolResults;
    }
    return msg;
  });

  const response = await fetch(`${NODE_BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: formattedMessages,
      threadId, // Pass threadId for agent context
      provider: config.provider,
      apiKey: config.anthropicApiKey,
      perplexityApiKey: config.perplexityApiKey,
      ollamaBaseUrl: config.ollamaBaseUrl,
      model: config.provider === "ollama" ? config.ollamaModel : undefined,
      enableTools: enableTools && config.enableTools,
      // Pass email credentials if configured
      emailConfig: emailConfig.emailAddress !== undefined && emailConfig.emailAddress !== ""
        ? {
            address: emailConfig.emailAddress,
            username: emailConfig.emailUsername,
            password: emailConfig.emailPassword,
            imapHost: emailConfig.emailImapHost,
            imapPort: emailConfig.emailImapPort,
            imapSecurity: emailConfig.emailImapSecurity,
            smtpHost: emailConfig.emailSmtpHost,
            smtpPort: emailConfig.emailSmtpPort,
            smtpSecurity: emailConfig.emailSmtpSecurity,
            sslVerify: emailConfig.emailSslVerify,
          }
        : undefined,
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
  const config = await getProviderConfigAsync();

  if (config.provider === "anthropic" && (config.anthropicApiKey === undefined || config.anthropicApiKey === "")) {
    throw new Error("Anthropic API key not set");
  }

  const response = await fetch(`${NODE_BACKEND_URL}/api/generate-title`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userMessage,
      assistantResponse,
      provider: config.provider,
      apiKey: config.anthropicApiKey,
      ollamaBaseUrl: config.ollamaBaseUrl,
      model: config.provider === "ollama" ? config.ollamaModel : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate title");
  }

  const data = (await response.json()) as { title: string };
  return data.title;
}

/**
 * Test email connection via the Node backend
 */
export async function testEmailConnection(emailConfig: EmailConfig): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`${NODE_BACKEND_URL}/api/email/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailConfig: {
        address: emailConfig.emailAddress,
        username: emailConfig.emailUsername,
        password: emailConfig.emailPassword,
        imapHost: emailConfig.emailImapHost,
        imapPort: emailConfig.emailImapPort,
        imapSecurity: emailConfig.emailImapSecurity,
        smtpHost: emailConfig.emailSmtpHost,
        smtpPort: emailConfig.emailSmtpPort,
        smtpSecurity: emailConfig.emailSmtpSecurity,
        sslVerify: emailConfig.emailSslVerify,
      },
    }),
  });
  return (await response.json()) as { success: boolean; error?: string };
}
