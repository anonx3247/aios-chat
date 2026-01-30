/**
 * ExecuteDisplay - Shows executor sub-agents in chat
 *
 * Displays when the executor agent calls execute([...]) to delegate tasks.
 */
import { useState } from "react";
import { Cog, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ToolInvocation } from "@app/types/message";
import { Markdown } from "../Markdown";

interface ExecuteDisplayProps {
  toolInvocation: ToolInvocation;
}

interface ExecuteAssignment {
  tasks: string[];
  context: string;
}

interface ExecuteArgs {
  assignments: ExecuteAssignment[];
}

interface ExecutionResult {
  taskIds: string[];
  success: boolean;
  summary: string;
  errors?: string[];
}

interface ExecuteResult {
  results?: ExecutionResult[];
  error?: string;
}

function SubExecutorCard({
  index,
  assignment,
  result,
  isLoading,
}: {
  index: number;
  assignment: ExecuteAssignment;
  result: ExecutionResult | undefined;
  isLoading: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const firstTask = assignment.tasks[0];
  const taskLabel = assignment.tasks.length === 1 && firstTask !== undefined
    ? `Task ${firstTask}`
    : `Tasks: ${assignment.tasks.join(", ")}`;

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: "var(--bg-tertiary)",
        border: `1px solid ${result?.success === false ? "var(--danger)" : "var(--border-secondary)"}`,
      }}
    >
      <button
        type="button"
        onClick={() => { setIsExpanded(!isExpanded); }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
        style={{ background: "transparent" }}
        disabled={isLoading}
      >
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium"
          style={{ background: "var(--bg-hover)", color: "var(--fg-muted)" }}
        >
          {index}
        </span>
        <div className="flex flex-1 flex-col min-w-0">
          <span
            className="truncate text-sm"
            style={{ color: "var(--fg-primary)" }}
          >
            {taskLabel}
          </span>
          <span
            className="truncate text-xs"
            style={{ color: "var(--fg-muted)" }}
          >
            {assignment.context.length > 50
              ? `${assignment.context.slice(0, 50)}...`
              : assignment.context}
          </span>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" style={{ color: "var(--fg-accent)" }} />
        ) : result !== undefined ? (
          <>
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "var(--success)" }} />
            ) : (
              <XCircle className="h-4 w-4 flex-shrink-0" style={{ color: "var(--danger)" }} />
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: "var(--fg-muted)" }} />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--fg-muted)" }} />
            )}
          </>
        ) : null}
      </button>

      {isExpanded && result !== undefined && (
        <div
          className="border-t px-3 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <div className="prose prose-sm max-w-none" style={{ color: "var(--fg-secondary)" }}>
            <Markdown content={result.summary} />
          </div>
          {result.errors !== undefined && result.errors.length > 0 && (
            <div className="mt-2 rounded-lg p-2" style={{ background: "var(--bg-hover)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--danger)" }}>
                Errors:
              </p>
              <ul className="mt-1 list-inside list-disc text-xs" style={{ color: "var(--danger)" }}>
                {result.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExecuteDisplay({ toolInvocation }: ExecuteDisplayProps) {
  const { state, args, result } = toolInvocation;
  const executeArgs = args as unknown as ExecuteArgs;
  const executeResult = result as ExecuteResult | undefined;

  const assignments = Array.isArray(executeArgs.assignments) ? executeArgs.assignments : [];
  const results = executeResult?.results ?? [];
  const isLoading = state === "call" || state === "partial-call";
  const errorMessage = executeResult?.error;
  const isComplete = state === "result" && errorMessage === undefined;
  const hasError = errorMessage !== undefined;

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const assignmentCount = assignments.length;
  const resultCount = results.length;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-secondary)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--bg-hover)" }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--fg-accent)" }} />
          ) : isComplete && failCount === 0 ? (
            <CheckCircle2 className="h-4 w-4" style={{ color: "var(--success)" }} />
          ) : (
            <Cog className="h-4 w-4" style={{ color: failCount > 0 ? "var(--danger)" : "var(--fg-muted)" }} />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
            {isLoading ? "Executing" : "Executed"} {String(assignmentCount)} work stream{assignmentCount !== 1 ? "s" : ""}
          </span>
          <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
            {isLoading
              ? `${String(resultCount)}/${String(assignmentCount)} complete`
              : hasError
                ? "Error occurred"
                : failCount > 0
                  ? `${String(successCount)} succeeded, ${String(failCount)} failed`
                  : "All work streams complete"}
          </span>
        </div>
      </div>

      {/* Sub-executor cards */}
      <div className="space-y-2 px-4 pb-4">
        {assignments.map((assignment, i) => (
          <SubExecutorCard
            key={i}
            index={i + 1}
            assignment={assignment}
            result={results[i]}
            isLoading={isLoading && results[i] === undefined}
          />
        ))}
      </div>

      {/* Error */}
      {hasError && (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "var(--border-secondary)" }}
        >
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
