/**
 * Agent Session & Task Management
 *
 * In-memory store for agent sessions and tasks.
 * Broadcasts updates via WebSocket.
 */
import { randomUUID } from "crypto";
import type {
  AgentSession,
  AgentSessionStatus,
  AgentTask,
  AgentTaskStatus,
  AgentTaskType,
  AgentToolContext,
} from "../types.js";
import { broadcastToThread } from "./websocket.js";

// In-memory stores
const agentSessions = new Map<string, AgentSession>();
const sessionsByThread = new Map<string, string>(); // threadId -> sessionId

// Agent context for tool execution (set per-request)
let currentAgentContext: AgentToolContext = {};

export function setAgentContext(context: AgentToolContext): void {
  currentAgentContext = context;
}

export function getAgentContext(): AgentToolContext {
  return currentAgentContext;
}

export function getAgentSession(sessionId: string): AgentSession | undefined {
  return agentSessions.get(sessionId);
}

export function createAgentSession(threadId: string): AgentSession {
  const existingSessionId = sessionsByThread.get(threadId);
  if (existingSessionId) {
    agentSessions.delete(existingSessionId);
  }

  const session: AgentSession = {
    id: randomUUID(),
    threadId,
    status: "planning",
    tasks: new Map(),
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };

  agentSessions.set(session.id, session);
  sessionsByThread.set(threadId, session.id);

  broadcastToThread(threadId, {
    type: "session_created",
    sessionId: session.id,
    threadId,
    session: { id: session.id, status: session.status },
  });

  return session;
}

export function getSessionByThread(threadId: string): AgentSession | undefined {
  const sessionId = sessionsByThread.get(threadId);
  return sessionId ? agentSessions.get(sessionId) : undefined;
}

export function updateSessionStatus(
  sessionId: string,
  status: AgentSessionStatus,
  error?: string
): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  session.status = status;
  session.lastActivityAt = new Date();
  if (error) session.error = error;

  const updateType =
    status === "complete"
      ? "session_complete"
      : status === "error"
        ? "session_error"
        : "session_updated";

  broadcastToThread(session.threadId, {
    type: updateType,
    sessionId,
    threadId: session.threadId,
    session: { id: session.id, status, error },
  });
}

export function addTaskToSession(
  sessionId: string,
  title: string,
  description: string,
  type: AgentTaskType
): AgentTask {
  const session = agentSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const task: AgentTask = {
    id: randomUUID(),
    sessionId,
    title,
    description,
    type,
    status: "staged",
    createdAt: new Date(),
  };

  session.tasks.set(task.id, task);
  session.lastActivityAt = new Date();

  broadcastToThread(session.threadId, {
    type: "task_created",
    sessionId,
    threadId: session.threadId,
    task,
  });

  return task;
}

export function updateTaskStatus(
  sessionId: string,
  taskId: string,
  status: AgentTaskStatus,
  result?: unknown
): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  const task = session.tasks.get(taskId);
  if (!task) return;

  task.status = status;
  if (result !== undefined) task.result = result;

  if (status === "in_progress" && !task.startedAt) {
    task.startedAt = new Date();
  }
  if (status === "done" || status === "cancelled") {
    task.completedAt = new Date();
  }

  session.lastActivityAt = new Date();

  broadcastToThread(session.threadId, {
    type: "task_updated",
    sessionId,
    threadId: session.threadId,
    task,
  });
}

export function getSessionTasks(sessionId: string): AgentTask[] {
  const session = agentSessions.get(sessionId);
  return session ? Array.from(session.tasks.values()) : [];
}

export function clearCompletedTasks(sessionId: string): void {
  const session = agentSessions.get(sessionId);
  if (!session) return;

  for (const [taskId, task] of session.tasks) {
    if (task.status === "done" || task.status === "cancelled") {
      session.tasks.delete(taskId);
    }
  }
}

export function cleanupIncompleteTasks(session: AgentSession, reason: string): void {
  for (const task of session.tasks.values()) {
    if (task.status === "in_progress") {
      task.status = "cancelled";
      task.completedAt = new Date();
      task.result = reason;

      broadcastToThread(session.threadId, {
        type: "task_updated",
        sessionId: session.id,
        threadId: session.threadId,
        task,
      });
    }
  }
}

export function getTasksSummary(
  session: AgentSession
): Array<{ title: string; type: string; status: string }> {
  return Array.from(session.tasks.values()).map((t) => ({
    title: t.title,
    type: t.type,
    status: t.status,
  }));
}
