import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client === null) {
    const apiKey = localStorage.getItem("anthropic_api_key");
    if (apiKey === null || apiKey === "") {
      throw new Error("Anthropic API key not set. Please add it in settings.");
    }
    client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
  return client;
}

export function resetClient(): void {
  client = null;
}

export function setApiKey(key: string): void {
  localStorage.setItem("anthropic_api_key", key);
  resetClient();
}

export function getApiKey(): string | null {
  return localStorage.getItem("anthropic_api_key");
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamChatResponse(
  messages: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> {
  const client = getAnthropicClient();

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  let fullResponse = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      fullResponse += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  return fullResponse;
}

export async function generateConversationTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Generate a very short title (3-5 words max) for a conversation that starts with this exchange. Reply with ONLY the title, no quotes or punctuation.

User: ${userMessage.slice(0, 200)}
Assistant: ${assistantResponse.slice(0, 200)}`,
      },
    ],
  });

  const content = response.content[0];
  if (content?.type === "text") {
    return content.text.trim();
  }
  return "New conversation";
}
