/**
 * TimeDisplay - Display for time MCP tool results
 *
 * Shows time information in a clean format.
 */
import { Clock, Loader2, XCircle, Globe2 } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";

interface TimeDisplayProps {
  toolInvocation: ToolInvocation;
}

// Type guard for MCP content items
interface MCPTextContent {
  type: "text";
  text: string;
}

interface MCPErrorContent {
  isError: boolean;
}

function isMCPTextContent(item: unknown): item is MCPTextContent {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    (item as { type: unknown }).type === "text" &&
    "text" in item
  );
}

function isMCPErrorContent(item: unknown): item is MCPErrorContent {
  if (typeof item !== "object" || item === null || !("isError" in item)) {
    return false;
  }
  return (item as MCPErrorContent).isError;
}

export function TimeDisplay({ toolInvocation }: TimeDisplayProps) {
  const { toolName, state, args, result } = toolInvocation;

  const isConvert = toolName === "time_convert_time";
  const timezone = typeof args.timezone === "string" ? args.timezone : null;

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
            {isConvert ? "Converting time..." : "Getting current time..."}
          </span>
          {timezone !== null && timezone.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
              {timezone}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Check if result indicates error
  const isError =
    result !== null &&
    typeof result === "object" &&
    ("error" in result || (Array.isArray(result) && result.some((r) => isMCPErrorContent(r))));

  // Extract content from MCP result format
  const getDisplayContent = (): string | null => {
    if (result === null) return null;
    if (typeof result === "string") return result;
    if (Array.isArray(result)) {
      const textContent = result.find((r): r is MCPTextContent => isMCPTextContent(r));
      return textContent?.text ?? null;
    }
    if (typeof result === "object" && "time" in result) {
      return String((result as { time: unknown }).time);
    }
    return JSON.stringify(result, null, 2);
  };

  const displayContent = getDisplayContent();

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: "var(--bg-hover)" }}
      >
        {isError ? (
          <XCircle className="h-4 w-4" style={{ color: "var(--danger)" }} />
        ) : isConvert ? (
          <Globe2 className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        ) : (
          <Clock className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
          {isConvert ? "Time Conversion" : "Current Time"}
        </span>
        {displayContent !== null && displayContent.length > 0 && (
          <span
            className="font-mono text-xs"
            style={{ color: isError ? "var(--danger)" : "var(--fg-muted)" }}
          >
            {displayContent}
          </span>
        )}
      </div>
    </div>
  );
}
