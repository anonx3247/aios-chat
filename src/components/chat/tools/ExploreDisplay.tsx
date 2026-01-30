/**
 * ExploreDisplay - Shows explore sub-agents in chat
 *
 * Displays when the plan agent calls explore([...]) with multiple prompts.
 */
import { useState } from "react";
import { Search, ChevronDown, ChevronRight, Loader2, CheckCircle2 } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { Markdown } from "../Markdown";
import { parseToolResult } from "./parseToolResult";

interface ExploreDisplayProps {
  toolInvocation: ToolInvocation;
}

interface ExploreArgs {
  prompts: string[];
}

interface ExploreResult {
  results?: string[];
  error?: string;
}

function SubAgentCard({
  index,
  prompt,
  result,
  isLoading,
}: {
  index: number;
  prompt: string;
  result: string | undefined;
  isLoading: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      <button
        type="button"
        onClick={() => { setIsExpanded(!isExpanded); }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
        style={{ background: "transparent" }}
        disabled={isLoading}
      >
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium"
          style={{ background: "var(--bg-hover)", color: "var(--fg-muted)" }}
        >
          {index}
        </span>
        <span
          className="flex-1 truncate text-sm"
          style={{ color: "var(--fg-primary)" }}
        >
          {prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt}
        </span>
        {isLoading ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" style={{ color: "var(--fg-accent)" }} />
        ) : result !== undefined && result !== "" ? (
          <>
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "var(--success)" }} />
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: "var(--fg-muted)" }} />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--fg-muted)" }} />
            )}
          </>
        ) : null}
      </button>

      {isExpanded && result !== undefined && result !== "" && (
        <div
          className="border-t px-3 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <div className="prose prose-sm max-w-none" style={{ color: "var(--fg-secondary)" }}>
            <Markdown content={result} />
          </div>
        </div>
      )}
    </div>
  );
}

export function ExploreDisplay({ toolInvocation }: ExploreDisplayProps) {
  const { state, args, result } = toolInvocation;
  const exploreArgs = args as unknown as ExploreArgs;
  const exploreResult = parseToolResult<ExploreResult>(result);

  const prompts = Array.isArray(exploreArgs.prompts) ? exploreArgs.prompts : [];
  const results = exploreResult?.results ?? [];
  const promptCount = prompts.length;
  const resultCount = results.length;
  const isLoading = state === "call" || state === "partial-call";
  const errorMessage = exploreResult?.error;
  const isComplete = state === "result" && errorMessage === undefined;
  const hasError = errorMessage !== undefined;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--bg-hover)" }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--fg-accent)" }} />
          ) : isComplete ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
          ) : (
            <Search className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            {isLoading ? "Exploring" : "Explored"} {String(promptCount)} area{promptCount !== 1 ? "s" : ""}
          </span>
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {isLoading
              ? `${String(resultCount)}/${String(promptCount)} complete`
              : hasError
                ? "Error occurred"
                : "All explorations complete"}
          </span>
        </div>
      </div>

      {/* Sub-agent cards */}
      <div className="space-y-2 px-4 pb-4">
        {prompts.map((prompt, i) => (
          <SubAgentCard
            key={i}
            index={i + 1}
            prompt={prompt}
            result={results[i]}
            isLoading={isLoading && results[i] === undefined}
          />
        ))}
      </div>

      {/* Error */}
      {hasError && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
