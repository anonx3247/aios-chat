/**
 * Context Length Management
 *
 * Token counting, message trimming, and tool result truncation
 * to keep conversations within provider context limits.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ChatIncomingMessage, ChatToolInvocation, ChatToolResult } from "../types.js";

// =============================================================================
// Token Counting
// =============================================================================

export async function countTokensAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  systemPrompt?: string
): Promise<number> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.countTokens({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(systemPrompt ? { system: systemPrompt } : {}),
  });

  console.log(`[Context] Anthropic countTokens result: ${response.input_tokens}`);
  return response.input_tokens;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export function getMaxContextTokens(provider: string, model?: string): number {
  const responseBuffer = 8000;

  if (provider === "anthropic") {
    return 200000 - responseBuffer;
  }

  if (model?.includes("qwen")) return 30000 - responseBuffer;
  if (model?.includes("llama")) return 120000 - responseBuffer;
  if (model?.includes("deepseek")) return 60000 - responseBuffer;

  return Math.max(8000, 16000 - responseBuffer);
}

// =============================================================================
// Tool Result Truncation (for messages)
// =============================================================================

function truncateToolResult(result: unknown, maxChars: number = 50000): unknown {
  if (result === null || result === undefined) return result;

  const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  if (resultStr.length <= maxChars) return result;

  console.log(`[Context] Truncating tool result: ${resultStr.length} chars -> ${maxChars} chars`);

  const lines = resultStr.split("\n");
  const firstLines = 10;
  const redactionNotice = "\n\n[... content truncated due to length ...]\n\n";

  const firstPart = lines.slice(0, firstLines).join("\n");
  const remainingChars = maxChars - firstPart.length - redactionNotice.length;

  if (remainingChars <= 0) {
    return firstPart + redactionNotice + "[end of truncated content]";
  }

  const lastPart = resultStr.slice(-remainingChars);
  const newlineIndex = lastPart.indexOf("\n");
  const cleanLastPart =
    newlineIndex > 0 && newlineIndex < 100 ? lastPart.slice(newlineIndex + 1) : lastPart;

  return firstPart + redactionNotice + cleanLastPart;
}

export function truncateToolResultsInMessages(
  messages: ChatIncomingMessage[],
  maxResultChars: number
): ChatIncomingMessage[] {
  return messages.map((msg): ChatIncomingMessage => {
    const newMsg: ChatIncomingMessage = { ...msg };

    if (newMsg.toolInvocations && newMsg.toolInvocations.length > 0) {
      newMsg.toolInvocations = newMsg.toolInvocations.map((inv): ChatToolInvocation => {
        if (inv.result !== undefined) {
          return { ...inv, result: truncateToolResult(inv.result, maxResultChars) };
        }
        return inv;
      });
    }

    if (newMsg.toolResults && newMsg.toolResults.length > 0) {
      newMsg.toolResults = newMsg.toolResults.map((tr): ChatToolResult => {
        if (tr.result !== undefined) {
          return { ...tr, result: truncateToolResult(tr.result, maxResultChars) };
        }
        return tr;
      });
    }

    return newMsg;
  });
}

// =============================================================================
// Message Trimming
// =============================================================================

export async function trimMessagesToFit<
  T extends {
    role: "user" | "assistant";
    content: string;
    toolInvocations?: unknown[];
    toolResults?: unknown[];
  },
>(
  messages: T[],
  provider: string,
  model: string,
  apiKey: string | undefined,
  systemPrompt: string | undefined,
  maxTokens: number,
  toolsOverheadTokens: number = 0
): Promise<T[]> {
  const effectiveMaxTokens = maxTokens - toolsOverheadTokens;
  const targetTokens = effectiveMaxTokens;
  console.log(`[Context] ====== TRIMMING START ======`);
  console.log(`[Context] Provider: ${provider}, Model: ${model}`);
  console.log(`[Context] Messages count: ${messages.length}`);
  console.log(
    `[Context] Max tokens: ${maxTokens}, Tools overhead: ${toolsOverheadTokens}, Effective: ${effectiveMaxTokens}`
  );
  const minKeep = Math.min(2, messages.length);

  if (provider === "anthropic" && apiKey) {
    console.log(`[Context] Using Anthropic token counting API`);
    try {
      const countableMessages = messages.map((m) => ({
        role: m.role,
        content: m.content + (m.toolInvocations ? JSON.stringify(m.toolInvocations) : ""),
      }));

      const totalChars = countableMessages.reduce((sum, m) => sum + m.content.length, 0);
      console.log(`[Context] Total message chars: ${totalChars}`);

      const totalTokens = await countTokensAnthropic(
        apiKey,
        model,
        countableMessages,
        systemPrompt
      );
      console.log(`[Context] Anthropic token count: ${totalTokens} (target: ${targetTokens})`);

      if (totalTokens <= targetTokens) {
        console.log(`[Context] No trimming needed`);
        return messages;
      }

      console.log(
        `[Context] TRIMMING REQUIRED: ${totalTokens} tokens > ${targetTokens} target`
      );

      let left = minKeep;
      let right = messages.length;

      while (left < right) {
        const mid = Math.ceil((left + right) / 2);
        const subset = messages.slice(-mid);
        const subsetCountable = subset.map((m) => ({
          role: m.role,
          content: m.content + (m.toolInvocations ? JSON.stringify(m.toolInvocations) : ""),
        }));

        const subsetTokens = await countTokensAnthropic(
          apiKey,
          model,
          subsetCountable,
          systemPrompt
        );

        if (subsetTokens <= targetTokens) {
          left = mid;
        } else {
          right = mid - 1;
        }
      }

      const kept = messages.slice(-left);
      const trimmedCountable = kept.map((m) => ({
        role: m.role,
        content: m.content + (m.toolInvocations ? JSON.stringify(m.toolInvocations) : ""),
      }));
      const trimmedTokens = await countTokensAnthropic(
        apiKey,
        model,
        trimmedCountable,
        systemPrompt
      );
      console.log(
        `[Context] Kept ${kept.length}/${messages.length} messages (${trimmedTokens} tokens)`
      );
      return kept;
    } catch (error) {
      console.error("[Context] !!!! Token counting API FAILED !!!!");
      console.error("[Context] Error:", error);
      console.error("[Context] Falling back to character-based estimation");
    }
  } else {
    console.log(
      `[Context] Skipping Anthropic API (provider=${provider}, hasKey=${!!apiKey})`
    );
  }

  // Fallback: estimation
  console.log(`[Context] Using character-based estimation (2 chars per token)`);
  let totalTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
  const tokenCounts = messages.map((msg) => {
    let count = estimateTokens(msg.content);
    if (msg.toolInvocations) count += estimateTokens(JSON.stringify(msg.toolInvocations));
    if (msg.toolResults) count += estimateTokens(JSON.stringify(msg.toolResults));
    totalTokens += count;
    return count;
  });

  if (totalTokens <= targetTokens) {
    return messages;
  }

  console.log(`[Context] Trimming: ~${totalTokens} tokens > ${targetTokens} target`);

  let trimmedMessages = [...messages];
  let currentTokens = totalTokens;
  let removeIndex = 0;

  while (currentTokens > targetTokens && trimmedMessages.length > minKeep) {
    currentTokens -= tokenCounts[removeIndex];
    removeIndex++;
    trimmedMessages = messages.slice(removeIndex);
  }

  console.log(
    `[Context] Kept ${trimmedMessages.length}/${messages.length} messages (~${currentTokens} tokens)`
  );
  return trimmedMessages;
}
