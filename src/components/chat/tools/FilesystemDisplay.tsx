/**
 * FilesystemDisplay - Display for filesystem MCP tool results
 *
 * Provides better visualization for file operations.
 */
import { useState } from "react";
import {
  File,
  Folder,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  FileText,
  FileCode,
  Image,
  Edit3,
  Search,
  Info,
} from "lucide-react";
import type { ToolInvocation } from "@app/types/message";

interface FilesystemDisplayProps {
  toolInvocation: ToolInvocation;
}

// Get icon for file operation
function getOperationIcon(toolName: string) {
  const op = toolName.replace("filesystem_", "");
  switch (op) {
    case "read_file":
    case "read_text_file":
      return FileText;
    case "read_media_file":
      return Image;
    case "read_multiple_files":
      return FileCode;
    case "write_file":
    case "edit_file":
      return Edit3;
    case "create_directory":
    case "list_directory":
    case "list_directory_with_sizes":
    case "directory_tree":
      return Folder;
    case "move_file":
      return File;
    case "search_files":
      return Search;
    case "get_file_info":
    case "list_allowed_directories":
      return Info;
    default:
      return File;
  }
}

// Format operation name for display
function formatOperationName(toolName: string): string {
  const op = toolName.replace("filesystem_", "");
  return op
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Get path from args
function getPathFromArgs(args: Record<string, unknown>): string | null {
  if (typeof args.path === "string") return args.path;
  if (typeof args.file_path === "string") return args.file_path;
  if (typeof args.directory === "string") return args.directory;
  if (typeof args.source === "string") return args.source;
  return null;
}

export function FilesystemDisplay({ toolInvocation }: FilesystemDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toolName, state, args, result } = toolInvocation;

  const Icon = getOperationIcon(toolName);
  const operationName = formatOperationName(toolName);
  const path = getPathFromArgs(args);

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
            {operationName}...
          </span>
          {path !== null && path.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
              {path.length > 50 ? `...${path.slice(-50)}` : path}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Type guard for MCP content items
  interface MCPTextContent {
    type: "text";
    text: string;
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

  // Check if result indicates error
  const isError =
    result !== null &&
    typeof result === "object" &&
    ("error" in result ||
      (Array.isArray(result) &&
        result.some((r) => isMCPTextContent(r) && r.text.includes("Error"))));

  // Extract content from MCP result format
  const getDisplayContent = (): string | null => {
    if (result === null) return null;
    if (typeof result === "string") return result;
    if (Array.isArray(result)) {
      const textContent = result.find((r): r is MCPTextContent => isMCPTextContent(r));
      return textContent?.text ?? JSON.stringify(result, null, 2);
    }
    return JSON.stringify(result, null, 2);
  };

  const displayContent = getDisplayContent();

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
            <Icon className="h-3 w-3" />
            {operationName}
          </span>
          {path !== null && path.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
              {path.length > 60 ? `...${path.slice(-60)}` : path}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
        ) : (
          <ChevronRight className="h-4 w-4" style={{ color: "var(--fg-muted)" }} />
        )}
      </button>

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
