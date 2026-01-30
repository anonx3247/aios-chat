import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentSession,
  AgentTask,
  AgentProgress,
  AgentToolCall,
  WSUpdate,
} from "@app/types/agent";

import { API_BASE_URL, WS_URL } from "@app/lib/config";

/**
 * Calculate progress from tasks
 */
function calculateProgress(tasks: AgentTask[]): AgentProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done" || t.status === "cancelled").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const staged = tasks.filter((t) => t.status === "staged").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, inProgress, staged, percent };
}

interface SubAgentState {
  index: number;
  prompt: string | undefined;
  taskIds: string[] | undefined;
  status: "running" | "done" | "error";
  summary: string | undefined;
  success: boolean | undefined;
}

interface ExploreState {
  prompts: string[];
  results: string[];
  subAgents: SubAgentState[];
  status: "running" | "complete";
}

interface UseAgentSessionResult {
  session: AgentSession | null;
  tasks: AgentTask[];
  progress: AgentProgress;
  toolCalls: AgentToolCall[];
  exploreState: ExploreState | null;
  isConnected: boolean;
  error: string | null;
}

/**
 * Hook to connect to agent session WebSocket and track progress
 */
export function useAgentSession(threadId: string | null): UseAgentSessionResult {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [exploreState, setExploreState] = useState<ExploreState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch initial state from REST API
  const fetchInitialState = useCallback(async () => {
    if (threadId === null) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agent/session/${threadId}`
      );
      if (response.ok) {
        const data = (await response.json()) as {
          session?: AgentSession;
          tasks?: AgentTask[];
        };
        if (data.session !== undefined) {
          setSession(data.session);
          setTasks(data.tasks ?? []);
        }
      }
    } catch (e) {
      console.error("[AgentSession] Failed to fetch initial state:", e);
    }
  }, [threadId]);

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent<string>) => {
    try {
      const update = JSON.parse(event.data) as WSUpdate;

      switch (update.type) {
        case "session_created":
        case "session_updated":
        case "session_complete":
        case "session_error": {
          const sessionUpdate = update.session;
          if (sessionUpdate !== undefined) {
            setSession((prev) => {
              const updated: AgentSession = {
                id: sessionUpdate.id,
                threadId: update.threadId,
                status: sessionUpdate.status,
                createdAt: prev?.createdAt ?? new Date().toISOString(),
                lastActivityAt: new Date().toISOString(),
              };
              if (sessionUpdate.error !== undefined) {
                updated.error = sessionUpdate.error;
              }
              return updated;
            });
          }
          break;
        }

        case "task_created": {
          const newTask = update.task;
          if (newTask !== undefined) {
            setTasks((prev) => {
              // Check for duplicates before adding
              if (prev.some((t) => t.id === newTask.id)) {
                return prev;
              }
              return [...prev, newTask];
            });
          }
          break;
        }

        case "task_updated": {
          const updatedTask = update.task;
          if (updatedTask !== undefined) {
            setTasks((prev) =>
              prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
            );
          }
          break;
        }

        case "explore_started":
          setExploreState({
            prompts: update.prompts ?? [],
            results: [],
            subAgents: (update.prompts ?? []).map((prompt, index): SubAgentState => ({
              index,
              prompt,
              taskIds: undefined,
              status: "running",
              summary: undefined,
              success: undefined,
            })),
            status: "running",
          });
          break;

        case "sub_agent_started":
          setExploreState((prev) => {
            if (!prev) return prev;
            const subAgents = [...prev.subAgents];
            const idx = update.index;
            if (idx !== undefined) {
              const existing = subAgents[idx];
              if (existing) {
                subAgents[idx] = {
                  index: existing.index,
                  prompt: existing.prompt,
                  taskIds: existing.taskIds,
                  status: "running",
                  summary: existing.summary,
                  success: existing.success,
                };
              }
            }
            return { ...prev, subAgents };
          });
          break;

        case "sub_agent_done":
          setExploreState((prev) => {
            if (!prev) return prev;
            const subAgents = [...prev.subAgents];
            const idx = update.index;
            if (idx !== undefined) {
              const existing = subAgents[idx];
              if (existing) {
                subAgents[idx] = {
                  index: existing.index,
                  prompt: existing.prompt,
                  taskIds: existing.taskIds,
                  status: "done",
                  summary: update.summary ?? existing.summary,
                  success: existing.success,
                };
              }
            }
            return { ...prev, subAgents };
          });
          break;

        case "explore_complete":
          setExploreState((prev) =>
            prev ? { ...prev, results: update.results ?? [], status: "complete" } : prev
          );
          break;

        case "sub_executor_started":
          // Could track executor sub-agents similarly if needed
          break;

        case "sub_executor_done":
          // Could track executor sub-agents similarly if needed
          break;

        case "tool_call": {
          const toolCall = update.toolCall;
          if (toolCall !== undefined) {
            setToolCalls((prev) => {
              // Check for duplicates before adding
              if (prev.some((tc) => tc.id === toolCall.id)) {
                return prev;
              }
              return [...prev, toolCall];
            });
          }
          break;
        }

        case "tool_result": {
          const toolCall = update.toolCall;
          if (toolCall !== undefined) {
            setToolCalls((prev) =>
              prev.map((tc): AgentToolCall => {
                if (tc.id !== toolCall.id) return tc;
                const updated: AgentToolCall = { id: tc.id, toolName: tc.toolName, status: "done" };
                if (tc.args !== undefined) updated.args = tc.args;
                if (toolCall.result !== undefined) updated.result = toolCall.result;
                return updated;
              })
            );
          }
          break;
        }
      }
    } catch (e) {
      console.error("[AgentSession] Failed to parse message:", e);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (threadId === null) return;

    // Clear any pending reconnect
    const existingTimeout = reconnectTimeoutRef.current;
    if (existingTimeout !== null) {
      clearTimeout(existingTimeout);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection
    const existingWs = wsRef.current;
    if (existingWs !== null) {
      existingWs.close();
    }

    try {
      const ws = new WebSocket(
        `${WS_URL}?threadId=${encodeURIComponent(threadId)}`
      );

      ws.onopen = () => {
        console.log("[AgentSession] Connected to WebSocket");
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        console.log("[AgentSession] WebSocket closed");
        setIsConnected(false);
        wsRef.current = null;

        // Reconnect after delay (threadId is guaranteed non-null since we early-return at start)
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (e) => {
        console.error("[AgentSession] WebSocket error:", e);
        setError("WebSocket connection error");
      };

      wsRef.current = ws;
    } catch (e) {
      console.error("[AgentSession] Failed to connect:", e);
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  }, [threadId, handleMessage]);

  // Connect when threadId changes
  useEffect(() => {
    if (threadId !== null) {
      // Fetch initial state first
      void fetchInitialState();
      // Then connect to WebSocket for updates
      connect();
    } else {
      // Clear state when no thread
      setSession(null);
      setTasks([]);
      setToolCalls([]);
      setExploreState(null);
    }

    return () => {
      const ws = wsRef.current;
      if (ws !== null) {
        ws.close();
        wsRef.current = null;
      }
      const timeout = reconnectTimeoutRef.current;
      if (timeout !== null) {
        clearTimeout(timeout);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [threadId, connect, fetchInitialState]);

  const progress = calculateProgress(tasks);

  return {
    session,
    tasks,
    progress,
    toolCalls,
    exploreState,
    isConnected,
    error,
  };
}
