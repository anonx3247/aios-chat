import { FileText, Loader2 } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { useDocumentStore } from "@app/stores/document-store";
import { useEffect } from "react";
import { parseToolResult } from "./parseToolResult";

interface ShowContentDisplayProps {
  toolInvocation: ToolInvocation;
}

export function ShowContentDisplay({ toolInvocation }: ShowContentDisplayProps) {
  const { state, args, result } = toolInvocation;
  const showContent = useDocumentStore((s) => s.showContent);

  const parsed = parseToolResult<{ title?: string; content?: string }>(result) ?? {};
  const title = parsed.title ?? (args as { title?: string }).title ?? "Content";
  const content = parsed.content;

  // Auto-open sidebar when result arrives
  useEffect(() => {
    if (state === "result" && content !== undefined && content !== "") {
      showContent(title, content);
    }
  }, [state, title, content, showContent]);

  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--fg-accent)" }} />
        <span className="text-sm" style={{ color: "var(--fg-primary)" }}>
          Preparing content...
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { if (content !== undefined && content !== "") showContent(title, content); }}
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:opacity-90"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
    >
      <FileText className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
      <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
        {title}
      </span>
      <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
        View in sidebar
      </span>
    </button>
  );
}
