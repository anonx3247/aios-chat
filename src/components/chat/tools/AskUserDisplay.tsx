/**
 * AskUserDisplay - Summary display for ask_user tool in message history
 *
 * This shows a compact summary of the question in the chat.
 * The actual interactive UI is rendered by AskUserQuestion above the composer.
 */
import { HelpCircle, CheckCircle2, Clock } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";

interface AskUserDisplayProps {
  toolInvocation: ToolInvocation;
}

interface AskUserArgs {
  question: string;
  type: "confirm" | "single_select" | "multi_select" | "text";
  options?: { value: string; label: string; description?: string }[];
}

interface AskUserResult {
  status: string;
  question: string;
  type: string;
}

export function AskUserDisplay({ toolInvocation }: AskUserDisplayProps) {
  const { state, args, result } = toolInvocation;
  const askArgs = args as unknown as AskUserArgs;

  // Loading/pending state - question is active
  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 py-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <Clock className="h-4 w-4 animate-pulse" style={{ color: "var(--fg-accent)" }} />
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Waiting for response...
        </span>
      </div>
    );
  }

  // Result state - question was answered or is awaiting
  // Note: result may be a string (JSON) due to backend truncation, so we need to parse it
  let parsedResult = result;
  if (typeof parsedResult === "string") {
    try {
      parsedResult = JSON.parse(parsedResult);
    } catch {
      // Not JSON, keep as string
    }
  }
  const askResult = parsedResult as AskUserResult | undefined;
  const isAwaiting = askResult?.status === "awaiting_user_input";

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3 py-2"
      style={{ background: "var(--bg-hover)" }}
    >
      {isAwaiting ? (
        <HelpCircle className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
      ) : (
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
      )}
      <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
        {askArgs.question.length > 50 ? `${askArgs.question.slice(0, 50)}...` : askArgs.question}
      </span>
    </div>
  );
}
