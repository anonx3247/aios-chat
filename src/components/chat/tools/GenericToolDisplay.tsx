/**
 * GenericToolDisplay - Fallback display for unknown tools
 *
 * Shows tool name, args, and result in a collapsible format.
 */
import { useState } from "react";
import { Terminal, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";

interface GenericToolDisplayProps {
  toolInvocation: ToolInvocation;
}

export function GenericToolDisplay({ toolInvocation }: GenericToolDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toolName, state, args, result } = toolInvocation;

  // Loading state
  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--bg-hover)" }}
        >
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Running {toolName}...
          </span>
          <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            {JSON.stringify(args).slice(0, 50)}
            {JSON.stringify(args).length > 50 ? "..." : ""}
          </span>
        </div>
      </div>
    );
  }

  // Check if result indicates error
  const isError = result !== null &&
    typeof result === "object" &&
    "error" in result;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
    >
      <button
        type="button"
        onClick={() => { setIsExpanded(!isExpanded); }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ background: "transparent" }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--bg-hover)" }}
        >
          {isError ? (
            <XCircle className="h-4 w-4" style={{ color: "var(--danger)" }} />
          ) : (
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
          )}
        </div>
        <div className="flex flex-1 flex-col">
          <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            <Terminal className="h-3 w-3" />
            {toolName}
          </span>
          <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
            {isError ? "Error" : "Completed"}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
        )}
      </button>

      {isExpanded && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          {Object.keys(args).length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                Arguments
              </span>
              <pre
                className="mt-1 overflow-x-auto rounded-lg p-3 text-xs"
                style={{ background: "var(--bg-tertiary)", color: "var(--fg-secondary)" }}
              >
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
              Result
            </span>
            <pre
              className="mt-1 overflow-x-auto rounded-lg p-3 text-xs"
              style={{
                background: "var(--bg-tertiary)",
                color: isError ? "var(--danger)" : "var(--fg-secondary)",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
