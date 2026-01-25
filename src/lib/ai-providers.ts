// AI Provider configuration
// API keys should be set via environment variables:
// - VITE_ANTHROPIC_API_KEY
// - VITE_OPENAI_API_KEY

export interface AIProvider {
  id: string;
  name: string;
  models: string[];
  defaultModel: string;
}

export const providers: AIProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      "claude-sonnet-4-20250514",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "openai",
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    defaultModel: "gpt-4o",
  },
];

export function getDefaultProvider(): AIProvider {
  const provider = providers[0];
  if (provider === undefined) {
    throw new Error("No providers configured");
  }
  return provider;
}

export function getProvider(id: string): AIProvider | undefined {
  return providers.find((p) => p.id === id);
}
