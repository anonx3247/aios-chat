/**
 * Agent task status for orchestration
 */
export type AgentTaskStatus = "staged" | "in_progress" | "done" | "cancelled";

/**
 * Task type for categorization
 */
export type AgentTaskType = "plan" | "explore" | "execute";

/**
 * A task tracked during agent orchestration
 */
export interface AgentTask {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  result?: unknown;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Session status for orchestration pipeline
 */
export type AgentSessionStatus =
  | "planning"
  | "exploring"
  | "executing"
  | "waiting_user"
  | "complete"
  | "error";

/**
 * An agent session for a thread
 */
export interface AgentSession {
  id: string;
  threadId: string;
  status: AgentSessionStatus;
  error?: string;
  currentActivity?: string;
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Tool call entry for showing agent progress
 */
export interface AgentToolCall {
  id: string;
  toolName: string;
  status: "calling" | "done";
  args?: Record<string, unknown>;
  result?: string;
}

/**
 * Progress information for a session
 */
export interface AgentProgress {
  total: number;
  done: number;
  inProgress: number;
  staged: number;
  percent: number;
}

/**
 * WebSocket update types
 */
export type WSUpdateType =
  | "session_created"
  | "session_updated"
  | "session_complete"
  | "session_error"
  | "task_created"
  | "task_updated"
  | "tool_call"
  | "tool_result"
  | "explore_started"
  | "explore_complete"
  | "sub_agent_started"
  | "sub_agent_done"
  | "sub_executor_started"
  | "sub_executor_done";

export interface WSUpdate {
  type: WSUpdateType;
  sessionId: string;
  threadId: string;
  session?: {
    id: string;
    status: AgentSessionStatus;
    error?: string;
    currentActivity?: string;
  };
  task?: AgentTask;
  // Tool call updates
  toolCall?: AgentToolCall;
  // Explore updates
  count?: number;
  prompts?: string[];
  results?: string[];
  // Sub-agent updates
  index?: number;
  prompt?: string;
  taskIds?: string[];
  summary?: string;
  success?: boolean;
}
