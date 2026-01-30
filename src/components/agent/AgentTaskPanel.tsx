/**
 * AgentTaskPanel - Side panel showing agent task progress
 *
 * Displays when an agent session is active, showing tasks and progress.
 */
import { CheckCircle2, Loader2, AlertCircle, X, Sparkles, Wrench } from "lucide-react";
import { useAgentSession } from "@app/hooks/useAgentSession";
import { AgentTaskItem } from "./AgentTaskItem";
import type { AgentSessionStatus, AgentToolCall } from "@app/types/agent";

/**
 * Format tool name for display (e.g., "perplexity_ask" -> "Perplexity Ask")
 */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * ToolCallItem - Shows a single tool call in the panel
 */
function ToolCallItem({ toolCall }: { toolCall: AgentToolCall }) {
  const isComplete = toolCall.status === "done";

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: "var(--bg-tertiary)" }}
    >
      {isComplete ? (
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--success)" }} />
      ) : (
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" style={{ color: "var(--fg-accent)" }} />
      )}
      <span className="truncate text-xs" style={{ color: "var(--fg-secondary)" }}>
        {formatToolName(toolCall.toolName)}
      </span>
    </div>
  );
}

interface AgentTaskPanelProps {
  threadId: string | null;
  onClose?: () => void;
}

function getStatusLabel(status: AgentSessionStatus): string {
  switch (status) {
    case "planning":
      return "Planning...";
    case "exploring":
      return "Exploring...";
    case "executing":
      return "Executing...";
    case "waiting_user":
      return "Waiting for input";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
  }
}

function getStatusColor(status: AgentSessionStatus): string {
  switch (status) {
    case "planning":
    case "exploring":
    case "executing":
      return "var(--fg-accent)";
    case "waiting_user":
      return "var(--warning)";
    case "complete":
      return "var(--success)";
    case "error":
      return "var(--danger)";
  }
}

export function AgentTaskPanel({ threadId, onClose }: AgentTaskPanelProps) {
  const { session, tasks, progress, toolCalls } = useAgentSession(threadId);

  // Don't render if no session
  if (!session) {
    return null;
  }

  const isActive = session.status !== "complete" && session.status !== "error";

  return (
    <aside
      className="flex h-full w-72 flex-shrink-0 flex-col border-l"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            Agent Tasks
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--fg-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Status */}
      <div
        className="flex items-center gap-2 border-b px-4 py-2"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        {isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: getStatusColor(session.status) }} />
        ) : session.status === "complete" ? (
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: getStatusColor(session.status) }} />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" style={{ color: getStatusColor(session.status) }} />
        )}
        <span className="text-xs font-medium" style={{ color: getStatusColor(session.status) }}>
          {getStatusLabel(session.status)}
        </span>
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--fg-muted)" }}>
            <span>Progress</span>
            <span>{String(progress.done)}/{String(progress.total)} tasks</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${String(progress.percent)}%`,
                background: session.status === "error" ? "var(--danger)" : "var(--fg-accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* Task list or tool calls */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tasks.length === 0 ? (
          toolCalls.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2 py-1">
                <Wrench className="h-3 w-3" style={{ color: "var(--fg-muted)" }} />
                <span className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>
                  Tool Calls
                </span>
              </div>
              <div className="space-y-1">
                {toolCalls.map((tc) => (
                  <ToolCallItem key={tc.id} toolCall={tc} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--fg-muted)" }} />
              <p className="mt-2 text-xs" style={{ color: "var(--fg-muted)" }}>
                Planning tasks...
              </p>
            </div>
          )
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <AgentTaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* Error message if any */}
      {session.error !== undefined && session.error !== "" && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {session.error}
          </p>
        </div>
      )}

      {/* Complete message */}
      {session.status === "complete" && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
              All tasks completed
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
