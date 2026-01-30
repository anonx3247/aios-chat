import { useState } from "react";
import { User, Check, X } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { getPersonality, setPersonality } from "@app/lib/ai";
import { parseToolResult } from "./parseToolResult";

interface UpdatePersonalityDisplayProps {
  toolInvocation: ToolInvocation;
}

export function UpdatePersonalityDisplay({ toolInvocation }: UpdatePersonalityDisplayProps) {
  const { state, result } = toolInvocation;
  const [accepted, setAccepted] = useState<boolean | null>(null);

  const parsed = parseToolResult<{ suggestion?: string; reason?: string }>(result) ?? {};
  const suggestion = parsed.suggestion ?? "";
  const reason = parsed.reason ?? "";

  if (state === "call" || state === "partial-call") {
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
      >
        <User className="h-4 w-4 animate-pulse" style={{ color: "var(--fg-accent)" }} />
        <span className="text-sm" style={{ color: "var(--fg-primary)" }}>
          Preparing personality suggestion...
        </span>
      </div>
    );
  }

  const currentPersonality = getPersonality();

  const handleAccept = () => {
    setPersonality(suggestion);
    setAccepted(true);
  };

  const handleReject = () => {
    setAccepted(false);
  };

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-secondary)" }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <User className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Personality Update Suggestion
          </span>
        </div>

        {reason && (
          <p className="text-xs mb-3" style={{ color: "var(--fg-muted)" }}>
            {reason}
          </p>
        )}

        {currentPersonality && (
          <div className="mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>Current</span>
            <pre
              className="mt-1 rounded-lg p-2 text-xs overflow-x-auto"
              style={{ background: "var(--bg-tertiary)", color: "var(--fg-secondary)" }}
            >
              {currentPersonality || "(empty)"}
            </pre>
          </div>
        )}

        <div className="mb-3">
          <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>Proposed</span>
          <pre
            className="mt-1 rounded-lg p-2 text-xs overflow-x-auto"
            style={{ background: "var(--bg-tertiary)", color: "var(--fg-accent)" }}
          >
            {suggestion}
          </pre>
        </div>

        {accepted === null ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: "var(--success)", color: "white" }}
            >
              <Check className="h-3 w-3" />
              Accept
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: "var(--bg-hover)", color: "var(--fg-secondary)" }}
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </div>
        ) : (
          <span
            className="text-xs font-medium"
            style={{ color: accepted ? "var(--success)" : "var(--fg-muted)" }}
          >
            {accepted ? "Accepted - personality updated" : "Rejected"}
          </span>
        )}
      </div>
    </div>
  );
}
