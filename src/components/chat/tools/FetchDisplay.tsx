/**
 * FetchDisplay - Display for fetch MCP tool results
 *
 * Shows web content fetched from URLs.
 */
import { useState } from "react";
import { Globe, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";

interface FetchDisplayProps {
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

export function FetchDisplay({ toolInvocation }: FetchDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { state, args, result } = toolInvocation;

  const url = typeof args.url === "string" ? args.url : null;

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
            Fetching...
          </span>
          {url !== null && url.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
              {url.length > 60 ? `${url.slice(0, 60)}...` : url}
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
    return JSON.stringify(result, null, 2);
  };

  const displayContent = getDisplayContent();
  const contentPreview = displayContent !== null ? displayContent.slice(0, 200) : null;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
    >
      <button
        type="button"
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
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
            <Globe className="h-3 w-3" />
            Web Fetch
          </span>
          {url !== null && url.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
              {url.length > 60 ? `${url.slice(0, 60)}...` : url}
            </span>
          )}
        </div>
        {url !== null && url.length > 0 && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="p-1 transition-colors hover:opacity-70"
          >
            <ExternalLink className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
          </a>
        )}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
        )}
      </button>

      {!isExpanded && contentPreview !== null && contentPreview.length > 0 && (
        <div className="border-t px-4 py-2" style={{ borderColor: "var(--border-secondary)" }}>
          <p className="line-clamp-2 text-xs" style={{ color: "var(--fg-secondary)" }}>
            {contentPreview}
            {displayContent !== null && displayContent.length > 200 ? "..." : ""}
          </p>
        </div>
      )}

      {isExpanded && displayContent !== null && displayContent.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-secondary)" }}>
          <pre
            className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs"
            style={{
              background: "var(--bg-tertiary)",
              color: isError ? "var(--danger)" : "var(--fg-secondary)",
            }}
          >
            {displayContent}
          </pre>
        </div>
      )}
    </div>
  );
}
