/**
 * ConfigureSettingsDisplay - Embeddable settings form for inline configuration
 *
 * Renders settings forms directly in the chat when the AI needs credentials.
 * Uses the settings registry to resolve hierarchical keys and renders the
 * appropriate sub-page. Persists submission state so forms stay closed after save.
 */
import { useState, useEffect, useCallback } from "react";
import { Settings, CheckCircle2 } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { resolveSettingsPath, getSettingsLabel } from "@app/lib/settings-registry";
import { markSettingsSubmitted, isSettingsSubmitted } from "@app/lib/settings-persistence";
import { SettingsPageRenderer } from "@app/components/settings/SettingsPageRenderer";

interface ConfigureSettingsDisplayProps {
  toolInvocation: ToolInvocation;
}

interface ConfigureSettingsArgs {
  settings_key: string;
  reason: string;
}

interface ConfigureSettingsResult {
  settings_key: string;
  reason: string;
  awaiting_user_input: boolean;
  configured?: boolean;
}

export function ConfigureSettingsDisplay({ toolInvocation }: ConfigureSettingsDisplayProps) {
  const { state, args, toolCallId } = toolInvocation;
  const settingsArgs = args as unknown as ConfigureSettingsArgs;
  const resolved = resolveSettingsPath(settingsArgs.settings_key);

  const [submitted, setSubmitted] = useState(false);
  const [checkingSubmission, setCheckingSubmission] = useState(true);

  // Check if already submitted on mount
  useEffect(() => {
    if (toolCallId) {
      void isSettingsSubmitted(toolCallId).then((val) => {
        setSubmitted(val);
        setCheckingSubmission(false);
      });
    } else {
      setCheckingSubmission(false);
    }
  }, [toolCallId]);

  // Check result for legacy configured flag
  let parsedResult = toolInvocation.result;
  if (typeof parsedResult === "string") {
    try { parsedResult = JSON.parse(parsedResult); } catch { /* keep as is */ }
  }
  const settingsResult = parsedResult as ConfigureSettingsResult | undefined;
  const wasConfigured = settingsResult?.configured === true;

  const handleSaved = useCallback(() => {
    setSubmitted(true);
    if (toolCallId) {
      void markSettingsSubmitted(toolCallId, settingsArgs.settings_key);
    }
  }, [toolCallId, settingsArgs.settings_key]);

  const label = getSettingsLabel(settingsArgs.settings_key);

  // Compact "configured" state
  if (submitted || (state === "result" && wasConfigured)) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: "var(--bg-hover)" }}>
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
        <span className="text-sm" style={{ color: "var(--fg-secondary)" }}>
          {label} configured
        </span>
      </div>
    );
  }

  // Loading submission check
  if (checkingSubmission) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{ background: "var(--bg-hover)" }}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--fg-muted)", borderTopColor: "transparent" }} />
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>Loading settings...</span>
      </div>
    );
  }

  // Interactive form
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-secondary)" }}>
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
          <Settings className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Configure {label}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--fg-muted)" }}>
            {settingsArgs.reason}
          </p>
        </div>
      </div>

      {/* Render the appropriate settings page inline */}
      <InlineSettingsForm pageId={resolved.pageId} subFilter={resolved.subFilter} onSaved={handleSaved} />
    </div>
  );
}

/**
 * Wraps SettingsPageRenderer with an onSaved callback by listening for
 * save events. Each page component manages its own save button, so we
 * wrap with a MutationObserver-free approach: we add a "Mark as configured"
 * button that appears after the page's own save completes.
 */
function InlineSettingsForm({
  pageId,
  subFilter,
  onSaved,
}: {
  pageId: string;
  subFilter?: string | undefined;
  onSaved: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div>
      <SettingsPageRenderer pageId={pageId} subFilter={subFilter} />
      {!showConfirm ? (
        <div className="mt-3 flex justify-end border-t pt-3" style={{ borderColor: "var(--border-secondary)" }}>
          <button
            type="button"
            onClick={() => {
              setShowConfirm(true);
              onSaved();
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ color: "var(--fg-accent)" }}
          >
            Mark as configured
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border-secondary)" }}>
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
          <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>Settings saved</span>
        </div>
      )}
    </div>
  );
}
