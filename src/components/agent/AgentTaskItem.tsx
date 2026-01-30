/**
 * AgentTaskItem - Individual task display in the agent panel
 */
import { Circle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { AgentTask } from "@app/types/agent";

interface AgentTaskItemProps {
  task: AgentTask;
}

export function AgentTaskItem({ task }: AgentTaskItemProps) {
  const { title, status, type } = task;

  const getStatusIcon = () => {
    switch (status) {
      case "staged":
        return <Circle className="h-3.5 w-3.5" style={{ color: "var(--fg-muted)" }} />;
      case "in_progress":
        return <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--fg-accent)" }} />;
      case "done":
        return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />;
      case "cancelled":
        return <XCircle className="h-3.5 w-3.5" style={{ color: "var(--fg-muted)" }} />;
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case "plan":
        return "var(--fg-accent)";
      case "explore":
        return "var(--info)";
      case "execute":
        return "var(--success)";
    }
  };

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors"
      style={{
        background: status === "in_progress" ? "var(--bg-hover)" : "transparent",
        opacity: status === "cancelled" ? 0.5 : 1,
      }}
    >
      <div className="mt-0.5 flex-shrink-0">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm leading-tight"
          style={{
            color: status === "done" || status === "cancelled"
              ? "var(--fg-muted)"
              : "var(--fg-primary)",
            textDecoration: status === "cancelled" ? "line-through" : "none",
          }}
        >
          {title}
        </p>
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: getTypeColor() }}
        >
          {type}
        </span>
      </div>
    </div>
  );
}
