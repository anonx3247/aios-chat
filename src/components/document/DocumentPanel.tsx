import { X, FileText, Globe } from "lucide-react";
import { useDocumentStore } from "@app/stores/document-store";
import { Markdown } from "@app/components/chat/Markdown";
import { useEffect, useState, useCallback, useRef } from "react";

function CodeBlock({ content, language }: { content: string; language: string }) {
  return (
    <pre
      className="overflow-auto p-4 font-mono text-sm"
      style={{ background: "var(--bg-tertiary)", color: "var(--fg-secondary)" }}
    >
      <code className={`language-${language}`}>{content}</code>
    </pre>
  );
}

function DocumentContent({ uri }: { uri: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (uri.startsWith("https://") || uri.startsWith("http://")) {
      // Web URL - render in iframe
      setLoading(false);
      return;
    }

    // File URI - read via fetch to the Tauri asset protocol or filesystem
    const filePath = uri.replace("file://", "");
    fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        setContent(`Failed to read: ${filePath}`);
        setLoading(false);
      });
  }, [uri]);

  // Web URL
  if (uri.startsWith("https://") || uri.startsWith("http://")) {
    return (
      <iframe
        src={uri}
        className="h-full w-full border-0"
        title="Document viewer"
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" style={{ color: "var(--fg-muted)" }}>
        Loading...
      </div>
    );
  }

  if (content === null) return null;

  // Determine render mode from extension
  const ext = uri.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "md" || ext === "markdown") {
    return (
      <div className="overflow-auto p-4">
        <Markdown content={content} />
      </div>
    );
  }

  if (ext === "pdf") {
    return (
      <object data={uri} type="application/pdf" className="h-full w-full">
        <p style={{ color: "var(--fg-muted)" }}>PDF viewer not available</p>
      </object>
    );
  }

  // Code files
  const codeExts: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
    css: "css", html: "html", json: "json", yaml: "yaml", yml: "yaml",
    toml: "toml", sh: "bash", bash: "bash", sql: "sql",
  };
  const language = codeExts[ext] ?? "text";
  return <CodeBlock content={content} language={language} />;
}

export function DocumentPanel() {
  const { document, close } = useDocumentStore();
  const [width, setWidth] = useState(() => Math.round(window.innerWidth * 2 / 3));
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - ev.clientX;
      setWidth(Math.max(300, Math.min(newWidth, window.innerWidth - 200)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  if (document === null) return null;

  return (
    <div
      className="relative flex h-full flex-col border-l"
      style={{
        width: `${String(width)}px`,
        minWidth: "300px",
        background: "var(--bg-primary)",
        borderColor: "var(--border-primary)",
      }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--fg-accent)] active:bg-[var(--fg-accent)]"
        style={{ opacity: 0.3 }}
        onMouseDown={handleMouseDown}
      />
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        {document.mode === "content" ? (
          <FileText className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        ) : (
          <Globe className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        )}
        <span
          className="flex-1 truncate text-sm font-medium"
          style={{ color: "var(--fg-primary)" }}
        >
          {document.title}
        </span>
        <button
          type="button"
          onClick={close}
          className="rounded-md p-1 transition-colors hover:opacity-80"
          style={{ color: "var(--fg-muted)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {document.mode === "content" ? (
          <div className="p-4">
            <Markdown content={document.content} />
          </div>
        ) : (
          <DocumentContent uri={document.uri} />
        )}
      </div>
    </div>
  );
}
