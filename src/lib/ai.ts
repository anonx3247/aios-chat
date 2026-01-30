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

import { API_BASE_URL } from "./config";

// Node backend URL
const NODE_BACKEND_URL = API_BASE_URL;

// Provider types
export type AIProvider = "anthropic" | "ollama" | "redpill";

export interface ProviderConfig {
  provider: AIProvider;
  anthropicApiKey: string | undefined;
  perplexityApiKey: string | undefined;
  firecrawlApiKey: string | undefined;
  redpillApiKey: string | undefined;
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
  return stored !== null ? (stored as AIProvider) : "redpill";
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
    // Default: enabled for Anthropic and RedPill, disabled for Ollama
    const p = getProvider();
    return p === "anthropic" || p === "redpill";
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

// API key storage - RedPill
export async function setRedpillApiKey(key: string): Promise<void> {
  await setCredentialWithFallback("redpill_api_key", key);
}

export async function getRedpillApiKey(): Promise<string | null> {
  return getCredentialWithFallback("redpill_api_key");
}

// API key storage - Firecrawl
export async function setFirecrawlApiKey(key: string): Promise<void> {
  await setCredentialWithFallback("firecrawl_api_key", key);
}

export async function getFirecrawlApiKey(): Promise<string | null> {
  return getCredentialWithFallback("firecrawl_api_key");
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
  const [anthropicApiKey, perplexityApiKey, firecrawlApiKey, redpillApiKey] = await Promise.all([
    getApiKey(),
    getPerplexityApiKey(),
    getFirecrawlApiKey(),
    getRedpillApiKey(),
  ]);

  return {
    provider,
    anthropicApiKey: anthropicApiKey ?? undefined,
    perplexityApiKey: perplexityApiKey ?? undefined,
    firecrawlApiKey: firecrawlApiKey ?? undefined,
    redpillApiKey: redpillApiKey ?? undefined,
    ollamaBaseUrl: getOllamaBaseUrl(),
    ollamaModel: getOllamaModel(),
    // Default: tools enabled for Anthropic and RedPill, disabled for Ollama (not all models support it)
    enableTools:
      localStorage.getItem("enable_tools") === "true" ||
      (localStorage.getItem("enable_tools") === null && (provider === "anthropic" || provider === "redpill")),
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
export function getProviderConfig(): Omit<ProviderConfig, "anthropicApiKey" | "perplexityApiKey" | "firecrawlApiKey" | "redpillApiKey"> & {
  anthropicApiKey: undefined;
  perplexityApiKey: undefined;
  firecrawlApiKey: undefined;
  redpillApiKey: undefined;
} {
  const provider = getProvider();
  return {
    provider,
    anthropicApiKey: undefined,
    perplexityApiKey: undefined,
    firecrawlApiKey: undefined,
    redpillApiKey: undefined,
    ollamaBaseUrl: getOllamaBaseUrl(),
    ollamaModel: getOllamaModel(),
    enableTools:
      localStorage.getItem("enable_tools") === "true" ||
      (localStorage.getItem("enable_tools") === null && (provider === "anthropic" || provider === "redpill")),
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
  hasToolCalls: boolean;
}

/**
 * NDJSON stream event types from the backend
 */
interface NDJSONEvent {
  type: "text" | "thinking" | "tool_call" | "tool_result" | "end" | "error";
  // text/thinking
  content?: string;
  // tool_call
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  // tool_result
  result?: unknown;
  // end
  hasToolCalls?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
  // error
  message?: string;
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
  if (config.provider === "redpill" && (config.redpillApiKey === undefined || config.redpillApiKey === "")) {
    throw new Error("RedPill API key not set. Please add it in settings.");
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
      redpillApiKey: config.redpillApiKey,
      perplexityApiKey: config.perplexityApiKey,
      firecrawlApiKey: config.firecrawlApiKey,
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
  let hasToolCalls = false;

  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines (NDJSON)
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.length === 0) continue;

      let event: NDJSONEvent;
      try {
        event = JSON.parse(line) as NDJSONEvent;
      } catch {
        continue;
      }

      switch (event.type) {
        case "text":
          if (event.content !== undefined) {
            fullText += event.content;
            onChunk(event.content);
          }
          break;

        case "thinking":
          // Could be forwarded to UI in the future
          break;

        case "tool_call": {
          const callInvocation: ToolInvocation = {
            toolCallId: event.id ?? "",
            toolName: event.name ?? "unknown",
            args: event.args ?? {},
            state: "call",
          };
          toolCallsInProgress.set(callInvocation.toolCallId, callInvocation);
          onToolInvocation?.(callInvocation);
          break;
        }

        case "tool_result": {
          const existing = toolCallsInProgress.get(event.id ?? "");
          if (existing !== undefined) {
            const resultInvocation: ToolInvocation = {
              toolCallId: existing.toolCallId ?? event.id ?? "",
              toolName: existing.toolName ?? "unknown",
              args: existing.args ?? {},
              state: "result",
              result: event.result,
            };
            toolInvocations.push(resultInvocation);
            toolCallsInProgress.delete(event.id ?? "");
            onToolInvocation?.(resultInvocation);
          }
          break;
        }

        case "end":
          hasToolCalls = event.hasToolCalls ?? false;
          break;

        case "error":
          console.error("[streamChatResponse] Backend error:", event.message);
          throw new Error(event.message ?? "Unknown error from backend");
          break;
      }
    }
  }

  // Process any remaining buffer
  if (buffer.length > 0) {
    try {
      const event = JSON.parse(buffer) as NDJSONEvent;
      if (event.type === "text" && event.content !== undefined) {
        fullText += event.content;
        onChunk(event.content);
      } else if (event.type === "end") {
        hasToolCalls = event.hasToolCalls ?? false;
      }
    } catch {
      // Incomplete JSON, ignore
    }
  }

  return { text: fullText, toolInvocations, hasToolCalls };
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
  if (config.provider === "redpill" && (config.redpillApiKey === undefined || config.redpillApiKey === "")) {
    throw new Error("RedPill API key not set");
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
      redpillApiKey: config.redpillApiKey,
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
