import { Globe, FileText, Loader2 } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { useDocumentStore } from "@app/stores/document-store";
import { useEffect } from "react";
import { parseToolResult } from "./parseToolResult";

interface ShowDocumentDisplayProps {
  toolInvocation: ToolInvocation;
}

export function ShowDocumentDisplay({ toolInvocation }: ShowDocumentDisplayProps) {
  const { state, args, result } = toolInvocation;
  const showDocument = useDocumentStore((s) => s.showDocument);

  const parsed = parseToolResult<{ uri?: string; title?: string }>(result) ?? {};
  const uri = parsed.uri ?? (args as { uri?: string }).uri ?? "";
  const title = parsed.title ?? (args as { title?: string }).title;
  const isWeb = uri.startsWith("http://") || uri.startsWith("https://");

  // Auto-open sidebar when result arrives
  useEffect(() => {
    if (state === "result" && uri) {
      showDocument(uri, title);
    }
  }, [state, uri, title, showDocument]);

  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--fg-accent)" }} />
        <span className="text-sm" style={{ color: "var(--fg-primary)" }}>
          Opening document...
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { if (uri) showDocument(uri, title); }}
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:opacity-90"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
    >
      {isWeb ? (
        <Globe className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
      ) : (
        <FileText className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
      )}
      <span className="text-sm font-medium truncate" style={{ color: "var(--fg-primary)" }}>
        {title ?? uri}
      </span>
      <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
        Open in sidebar
      </span>
    </button>
  );
}
