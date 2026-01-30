/**
 * Shared types for the node backend
 */

// =============================================================================
// Agent Session & Task Types
// =============================================================================

export type AgentTaskStatus = "staged" | "in_progress" | "done" | "cancelled";
export type AgentTaskType = "plan" | "explore" | "execute";

export interface AgentTask {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  type: AgentTaskType;
  status: AgentTaskStatus;
  result?: unknown;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export type AgentSessionStatus =
  | "planning"
  | "exploring"
  | "executing"
  | "waiting_user"
  | "complete"
  | "error";

export interface AgentSession {
  id: string;
  threadId: string;
  status: AgentSessionStatus;
  tasks: Map<string, AgentTask>;
  planContent?: string;
  error?: string;
  createdAt: Date;
  lastActivityAt: Date;
}

// =============================================================================
// WebSocket Update Types
// =============================================================================

interface WSUpdateBase {
  sessionId: string;
  threadId: string;
}

export interface WSSessionUpdate extends WSUpdateBase {
  type: "session_created" | "session_updated" | "session_complete" | "session_error";
  session: {
    id: string;
    status: AgentSessionStatus;
    error?: string;
  };
}

export interface WSTaskUpdate extends WSUpdateBase {
  type: "task_created" | "task_updated";
  task: AgentTask;
}

export interface WSExploreUpdate extends WSUpdateBase {
  type: "explore_started" | "explore_complete";
  count?: number;
  prompts?: string[];
  results?: string[];
}

export interface WSSubAgentUpdate extends WSUpdateBase {
  type: "sub_agent_started" | "sub_agent_done" | "sub_executor_started" | "sub_executor_done";
  index: number;
  prompt?: string;
  taskIds?: string[];
  summary?: string;
  success?: boolean;
}

export interface WSToolCallUpdate extends WSUpdateBase {
  type: "tool_call" | "tool_result";
  toolCall: {
    id: string;
    toolName: string;
    status: "calling" | "done";
    args?: Record<string, unknown>;
    result?: string;
  };
}

export type WSUpdate =
  | WSSessionUpdate
  | WSTaskUpdate
  | WSExploreUpdate
  | WSSubAgentUpdate
  | WSToolCallUpdate;

// =============================================================================
// MCP Types
// =============================================================================

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPConnection {
  client: import("@modelcontextprotocol/sdk/client/index.js").Client;
  transport: { close(): Promise<void> };
  tools: Map<string, { description: string; inputSchema: Record<string, unknown> }>;
}

// =============================================================================
// Chat API Types
// =============================================================================

export interface EmailConfig {
  address: string;
  username?: string;
  password: string;
  imapHost?: string;
  imapPort?: string;
  imapSecurity?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpSecurity?: string;
  sslVerify?: string;
}

export interface ChatToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: string;
  result?: unknown;
}

export interface ChatToolResult {
  toolCallId: string;
  result: unknown;
}

export interface ChatIncomingMessage {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ChatToolInvocation[];
  toolResults?: ChatToolResult[];
}

// =============================================================================
// Agent Tool Context
// =============================================================================

export interface AgentToolContext {
  sessionId?: string;
  threadId?: string;
  apiKey?: string;
  perplexityApiKey?: string | null;
}

// =============================================================================
// Orchestration Result
// =============================================================================

export interface OrchestrationResult {
  success: boolean;
  summary: string;
  tasksSummary: Array<{ title: string; type: string; status: string }>;
  error?: string;
}

export interface AgentRunResult {
  success: boolean;
  summary: string;
  error?: string;
}
