/**
 * AI Provider Selection
 *
 * Creates the appropriate AI model based on provider configuration.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { ollama, createOllama } from "ollama-ai-provider";
import type { LanguageModelV1 } from "ai";

export function createAIModel(
  providerType: "anthropic" | "ollama",
  apiKey: string | undefined,
  ollamaBaseUrl: string,
  model: string | undefined
): LanguageModelV1 {
  if (providerType === "ollama") {
    const ollamaProvider =
      ollamaBaseUrl === "http://localhost:11434"
        ? ollama
        : createOllama({ baseURL: ollamaBaseUrl });
    return ollamaProvider(model ?? "qwen3-vl:latest");
  }

  if (!apiKey) {
    throw new Error("API key required for Anthropic");
  }
  const anthropic = createAnthropic({ apiKey });
  return anthropic(model ?? "claude-sonnet-4-20250514");
}

/**
 * Create model with /api suffix for Ollama tool use
 */
export function createOllamaToolModel(
  ollamaBaseUrl: string,
  model: string | undefined
): LanguageModelV1 {
  const ollamaForTools = createOllama({ baseURL: `${ollamaBaseUrl}/api` });
  return ollamaForTools(model ?? "qwen3-vl:latest");
}
