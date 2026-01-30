/**
 * PerplexityDisplay - Display component for Perplexity search results
 *
 * Shows a compact card that expands to show full results when clicked.
 */
import { useState } from "react";
import { Search, BookOpen, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { Markdown } from "../Markdown";

interface PerplexityDisplayProps {
  toolInvocation: ToolInvocation;
}

interface PerplexityResult {
  answer?: string;
  research?: string;
  reasoning?: string;
  citations?: string[];
}

export function PerplexityDisplay({ toolInvocation }: PerplexityDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toolName, state, args, result } = toolInvocation;

  // Determine display info based on tool variant
  const getToolInfo = () => {
    switch (toolName) {
      case "perplexity_ask":
        return { icon: Search, label: "Searching", doneLabel: "Search result", resultKey: "answer" as const };
      case "perplexity_research":
        return { icon: BookOpen, label: "Researching", doneLabel: "Research result", resultKey: "research" as const };
      case "perplexity_reason":
        return { icon: Lightbulb, label: "Analyzing", doneLabel: "Analysis result", resultKey: "reasoning" as const };
      default:
        return { icon: Search, label: "Searching", doneLabel: "Result", resultKey: "answer" as const };
    }
  };

  const { icon: Icon, label, doneLabel, resultKey } = getToolInfo();
  const query = (args as { query?: string }).query ?? "";

  // Loading state
  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 py-2"
        style={{ background: "var(--bg-hover)" }}
      >
        <Icon className="h-4 w-4 animate-pulse" style={{ color: "var(--fg-accent)" }} />
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {label}: {query.slice(0, 40)}{query.length > 40 ? "..." : ""}
        </span>
      </div>
    );
  }

  // Result state
  const perplexityResult = result as PerplexityResult | undefined;
  const content = perplexityResult?.[resultKey] ?? "";
  const citations = perplexityResult?.citations ?? [];

  // Get first line/sentence for preview
  const getPreview = () => {
    const firstLine = content.split(/[.\n]/)[0] ?? "";
    return firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine;
  };

  // Format content with citations as markdown links
  let formattedContent = content;
  if (citations.length > 0) {
    formattedContent += "\n\n**Sources:**\n";
    citations.forEach((url, index) => {
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        formattedContent += `- [${domain}](${url})\n`;
      } catch {
        formattedContent += `- [Source ${String(index + 1)}](${url})\n`;
      }
    });
  }

  // Collapsed view - compact card
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => { setIsExpanded(true); }}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:opacity-80"
        style={{ background: "var(--bg-hover)" }}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--fg-accent)" }} />
        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--fg-secondary)" }}>
          {doneLabel}: {getPreview()}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
      </button>
    );
  }

  // Expanded view - full content
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--bg-hover)" }}
    >
      <button
        type="button"
        onClick={() => { setIsExpanded(false); }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:opacity-80"
        style={{ borderBottom: "1px solid var(--border-secondary)" }}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--fg-accent)" }} />
        <span className="flex-1 text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
          {doneLabel}
        </span>
        <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
      </button>
      <div className="max-h-80 overflow-y-auto px-3 py-2 text-sm">
        <Markdown content={formattedContent} />
      </div>
    </div>
  );
}
