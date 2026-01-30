/**
 * Multi-Agent Orchestrator
 *
 * Runs the plan → explore → execute pipeline for complex tasks.
 */
import { streamText, generateText, type CoreTool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AgentSession, AgentRunResult, OrchestrationResult } from "../types.js";
import {
  getAgentSession,
  getAgentContext,
  setAgentContext,
  updateSessionStatus,
  cleanupIncompleteTasks,
  getTasksSummary,
} from "./sessions.js";
import { broadcastToThread } from "./websocket.js";
import { getMCPToolsForAISDK } from "../mcp/tools.js";
import { createPerplexityTools } from "../tools/perplexity.js";
import {
  askUserTool,
  addTaskTool,
  setTaskTool,
  viewTasksTool,
  summarizeFindingsTool,
  reportCompletionTool,
} from "../tools/builtin.js";

// =============================================================================
// Sub-Agent System Prompts
// =============================================================================

const PLAN_AGENT_PROMPT = `You are a planning agent that analyzes complex tasks and creates execution plans.

Your job:
1. Analyze the user's complex request
2. Break it down into discrete, actionable tasks
3. Use the explore() tool to gather information if needed
4. Use add_task() to create trackable tasks
5. When done planning, summarize what will be done

You have access to:
- explore(prompts): Launch multiple explore agents to gather information in parallel
- add_task(title, description, type): Add a task to track
- set_task(taskId, status): Update task status
- ask_user(question): Ask the user for clarification if needed

Be thorough but efficient. Create clear, specific tasks that can be executed independently where possible.`;

const EXPLORE_AGENT_PROMPT = `You are an autonomous exploration agent.

IMPORTANT: You work COMPLETELY AUTONOMOUSLY.
- You CANNOT ask questions or interact with humans
- You CANNOT expect any user messages
- You must complete your research independently

You have access to tools for:
- Web search (perplexity_ask, perplexity_research)
- File reading (filesystem_read_file, filesystem_list_directory)
- Web fetching (fetch_fetch)

Research thoroughly, then call summarize_findings() with a concise summary.
Focus on facts and specific details. Be concise but complete.`;

const SUB_EXECUTOR_PROMPT = `You are an autonomous executor sub-agent.

IMPORTANT: You work COMPLETELY AUTONOMOUSLY.
- You CANNOT ask questions or interact with humans
- You CANNOT expect any user messages
- You must complete your tasks independently or report failure

Your job:
1. Execute the assigned tasks using available tools
2. Call set_task(taskId, 'in_progress') when starting a task
3. Call set_task(taskId, 'done') when completing a task
4. Call report_completion() when finished with all tasks

If you encounter a blocking issue you cannot resolve:
1. Call set_task(taskId, 'cancelled') with reason
2. Call report_completion(success: false, errors: [...])`;

const EXECUTOR_AGENT_PROMPT = `You are the main executor agent. You execute the tasks that were created during planning.

Your job:
1. Review the pending tasks using view_tasks()
2. For tasks that can be parallelized, use execute() to spawn sub-agents
3. For tasks that need sequential execution or coordination, execute them yourself
4. Mark tasks as in_progress before starting, and done when complete
5. You CAN use ask_user if you need clarification from the user

Available tools:
- view_tasks: See all tasks and their status
- set_task: Update task status (in_progress, done, cancelled)
- execute: Spawn parallel sub-agents for independent work streams
- All MCP tools (filesystem, fetch, etc.)
- ask_user: Ask the user for clarification if needed

Execute all pending tasks, then report completion.`;

// =============================================================================
// Helper: Stream and broadcast tool calls
// =============================================================================

async function streamAndBroadcast(
  result: ReturnType<typeof streamText>,
  session: AgentSession,
  label: string
): Promise<string> {
  let finalText = "";

  for await (const part of result.fullStream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = part as any;

    if (p.type === "text-delta") {
      finalText += p.textDelta as string;
    } else if (p.type === "tool-call") {
      console.log(`[${label}] Tool call: ${p.toolName}`);
      broadcastToThread(session.threadId, {
        type: "tool_call",
        sessionId: session.id,
        threadId: session.threadId,
        toolCall: {
          id: p.toolCallId as string,
          toolName: p.toolName as string,
          status: "calling",
          args: p.args as Record<string, unknown> | undefined,
        },
      });
    } else if (p.type === "tool-result") {
      console.log(`[${label}] Tool result: ${p.toolName}`);
      broadcastToThread(session.threadId, {
        type: "tool_result",
        sessionId: session.id,
        threadId: session.threadId,
        toolCall: {
          id: p.toolCallId as string,
          toolName: p.toolName as string,
          status: "done",
          result: typeof p.result === "string" ? p.result : JSON.stringify(p.result),
        },
      });
    }
  }

  return finalText;
}

// =============================================================================
// Pipeline Stages
// =============================================================================

async function runPlanAgent(
  session: AgentSession,
  task: string,
  apiKey: string,
  perplexityApiKey: string | null | undefined
): Promise<AgentRunResult> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");

  const mcpTools = getMCPToolsForAISDK();
  const perplexityTools = createPerplexityTools(perplexityApiKey);

  const planAgentTools: Record<string, CoreTool> = {
    add_task: addTaskTool,
    set_task: setTaskTool,
    view_tasks: viewTasksTool,
    explore: exploreTool,
    ask_user: askUserTool,
    ...mcpTools,
  };
  for (const [name, t] of Object.entries(perplexityTools)) {
    if (t !== undefined) planAgentTools[name] = t;
  }

  try {
    console.log(`[PlanAgent] Starting for session ${session.id}, task: ${task.slice(0, 100)}...`);

    const result = streamText({
      model,
      system: PLAN_AGENT_PROMPT + `\n\nThe task to plan:\n${task}`,
      messages: [
        {
          role: "user",
          content:
            "Begin planning this task now. Break it down into actionable steps. When done, provide a summary of the plan.",
        },
      ],
      tools: planAgentTools,
      maxSteps: 15,
    });

    const finalText = await streamAndBroadcast(result, session, "PlanAgent");

    const tasks = Array.from(session.tasks.values());
    const pendingExecuteTasks = tasks.filter(
      (t) => t.type === "execute" && (t.status === "staged" || t.status === "in_progress")
    );

    if (pendingExecuteTasks.length > 0) {
      session.status = "executing";
      broadcastToThread(session.threadId, {
        type: "session_updated",
        sessionId: session.id,
        threadId: session.threadId,
        session: { id: session.id, status: session.status },
      });
      console.log(
        `[PlanAgent] Planning complete, ${pendingExecuteTasks.length} execute tasks pending`
      );
    }

    const summary = finalText || `Planning complete. Created ${tasks.length} tasks.`;
    console.log(`[PlanAgent] Completed for session ${session.id}`);
    return { success: true, summary };
  } catch (error) {
    console.error(`[PlanAgent] Error:`, error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    cleanupIncompleteTasks(session, `Planning error: ${errorMsg}`);
    session.status = "error";
    session.error = errorMsg;
    broadcastToThread(session.threadId, {
      type: "session_error",
      sessionId: session.id,
      threadId: session.threadId,
      session: { id: session.id, status: session.status, error: session.error },
    });
    return { success: false, summary: "Planning failed", error: errorMsg };
  }
}

async function runExecutorAgent(
  session: AgentSession,
  apiKey: string,
  perplexityApiKey: string | null | undefined
): Promise<AgentRunResult> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");
  const threadId = session.threadId;

  setAgentContext({ sessionId: session.id, threadId, apiKey, perplexityApiKey });

  const mcpTools = getMCPToolsForAISDK();
  const perplexityTools = createPerplexityTools(perplexityApiKey);

  const executorTools: Record<string, CoreTool> = {
    view_tasks: viewTasksTool,
    set_task: setTaskTool,
    execute: executeTool,
    ask_user: askUserTool,
    ...mcpTools,
  };
  for (const [name, t] of Object.entries(perplexityTools)) {
    if (t !== undefined) executorTools[name] = t;
  }

  const pendingTasks = Array.from(session.tasks.values()).filter(
    (t) => t.type === "execute" && (t.status === "staged" || t.status === "in_progress")
  );
  const taskList = pendingTasks
    .map((t) => `- [${t.id}] ${t.title}: ${t.description}`)
    .join("\n");

  try {
    console.log(
      `[ExecutorAgent] Starting for session ${session.id}, ${pendingTasks.length} pending tasks`
    );

    const result = streamText({
      model,
      system: EXECUTOR_AGENT_PROMPT + `\n\nPending execute tasks:\n${taskList}`,
      messages: [
        {
          role: "user",
          content:
            "Execute all pending tasks now. Mark each task as in_progress before starting and done when complete. When finished, provide a summary of what was accomplished.",
        },
      ],
      tools: executorTools,
      maxSteps: 30,
    });

    const finalText = await streamAndBroadcast(result, session, "ExecutorAgent");

    const remainingTasks = Array.from(session.tasks.values()).filter(
      (t) => t.type === "execute" && (t.status === "staged" || t.status === "in_progress")
    );
    const completedTasks = Array.from(session.tasks.values()).filter(
      (t) => t.status === "done"
    );

    if (remainingTasks.length === 0) {
      session.status = "complete";
      broadcastToThread(threadId, {
        type: "session_complete",
        sessionId: session.id,
        threadId,
        session: { id: session.id, status: session.status },
      });
      console.log(`[ExecutorAgent] All tasks completed for session ${session.id}`);
    } else {
      cleanupIncompleteTasks(session, "Executor finished without completing this task");
      console.log(
        `[ExecutorAgent] ${remainingTasks.length} tasks still pending, marked as cancelled`
      );
    }

    const summary = finalText || `Execution complete. Completed ${completedTasks.length} tasks.`;
    return { success: remainingTasks.length === 0, summary };
  } catch (error) {
    console.error(`[ExecutorAgent] Error:`, error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    cleanupIncompleteTasks(session, `Error: ${errorMsg}`);
    session.status = "error";
    session.error = errorMsg;
    broadcastToThread(threadId, {
      type: "session_error",
      sessionId: session.id,
      threadId,
      session: { id: session.id, status: session.status, error: session.error },
    });
    return { success: false, summary: "Execution failed", error: errorMsg };
  }
}

// =============================================================================
// Sub-Agent Runners
// =============================================================================

async function runExploreAgent(
  prompt: string,
  apiKey: string,
  perplexityApiKey: string | null | undefined,
  mcpToolsForAgent: Record<string, CoreTool>
): Promise<string> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");

  const perplexityTools = createPerplexityTools(perplexityApiKey);
  const exploreTools: Record<string, CoreTool> = {
    summarize_findings: summarizeFindingsTool,
    ...mcpToolsForAgent,
  };
  for (const [name, t] of Object.entries(perplexityTools)) {
    if (t !== undefined) exploreTools[name] = t;
  }

  const result = await generateText({
    model,
    system: EXPLORE_AGENT_PROMPT + `\n\nYour exploration task:\n${prompt}`,
    messages: [{ role: "user", content: "Begin your research now." }],
    tools: exploreTools,
    maxSteps: 10,
  });

  const summaryCall = result.toolCalls?.find((c) => c.toolName === "summarize_findings");
  const args = summaryCall?.args as { summary?: string } | undefined;
  return args?.summary ?? result.text;
}

async function runExecutorSubAgent(
  taskIds: string[],
  context: string,
  sessionId: string,
  apiKey: string,
  mcpToolsForAgent: Record<string, CoreTool>
): Promise<{ taskIds: string[]; success: boolean; summary: string; errors?: string[] }> {
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic("claude-sonnet-4-20250514");

  const session = getAgentSession(sessionId);
  setAgentContext({ sessionId, threadId: session?.threadId, apiKey });

  const executorTools = {
    ...mcpToolsForAgent,
    set_task: setTaskTool,
    report_completion: reportCompletionTool,
  };

  const result = await generateText({
    model,
    system:
      SUB_EXECUTOR_PROMPT +
      `\n\nAssigned tasks: ${taskIds.join(", ")}\n\nContext:\n${context}`,
    messages: [{ role: "user", content: "Execute your assigned tasks now." }],
    tools: executorTools,
    maxSteps: 20,
  });

  const reportCall = result.toolCalls?.find((c) => c.toolName === "report_completion");
  const reportArgs = reportCall?.args as
    | { success?: boolean; summary?: string; errors?: string[] }
    | undefined;
  return {
    taskIds,
    success: reportArgs?.success ?? false,
    summary: reportArgs?.summary ?? result.text,
    errors: reportArgs?.errors,
  };
}

// =============================================================================
// Explore & Execute Tools (used by plan/executor agents)
// =============================================================================

import { tool } from "ai";
import { z } from "zod";

export const exploreTool = tool({
  description: `Launch multiple explore agents concurrently to gather information.
Each prompt spawns a separate autonomous agent that researches and returns findings.
This tool blocks until all agents complete.

Use this to gather information in parallel before planning.`,
  parameters: z.object({
    prompts: z.array(z.string()).describe("Array of exploration prompts, one per agent"),
  }),
  execute: async ({ prompts }) => {
    const { sessionId, threadId, apiKey, perplexityApiKey } = getAgentContext();
    const session = sessionId ? getAgentSession(sessionId) : undefined;

    if (!apiKey) {
      return { error: "No API key available for sub-agents", results: [] };
    }

    if (threadId) {
      broadcastToThread(threadId, {
        type: "explore_started",
        sessionId: sessionId ?? "",
        threadId,
        count: prompts.length,
        prompts,
      });
    }

    if (session) {
      updateSessionStatus(sessionId!, "exploring");
    }

    const mcpToolsForAgent = getMCPToolsForAISDK();

    const results = await Promise.all(
      prompts.map(async (prompt, index) => {
        if (threadId) {
          broadcastToThread(threadId, {
            type: "sub_agent_started",
            sessionId: sessionId ?? "",
            threadId,
            index,
            prompt,
          });
        }

        try {
          const summary = await runExploreAgent(prompt, apiKey, perplexityApiKey, mcpToolsForAgent);
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_agent_done",
              sessionId: sessionId ?? "",
              threadId,
              index,
              summary,
            });
          }
          return summary;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_agent_done",
              sessionId: sessionId ?? "",
              threadId,
              index,
              summary: `Error: ${errorMsg}`,
            });
          }
          return `Error exploring: ${errorMsg}`;
        }
      })
    );

    if (threadId) {
      broadcastToThread(threadId, {
        type: "explore_complete",
        sessionId: sessionId ?? "",
        threadId,
        results,
      });
    }

    return { results };
  },
});

export const executeTool = tool({
  description: `Delegate tasks to parallel executor sub-agents.
Each sub-agent works AUTONOMOUSLY (no human interaction).
Assign tasks by ID so sub-agents can mark them complete.

Use this to parallelize independent work streams.`,
  parameters: z.object({
    assignments: z
      .array(
        z.object({
          tasks: z.array(z.string()).describe("Task IDs to assign to this sub-agent"),
          context: z.string().describe("Instructions and context for the sub-agent"),
        })
      )
      .describe("Array of task assignments, one per sub-agent"),
  }),
  execute: async ({ assignments }) => {
    const { sessionId, threadId, apiKey } = getAgentContext();

    if (!apiKey) {
      return { error: "No API key available for sub-agents", results: [] };
    }
    if (!sessionId) {
      return { error: "No active agent session", results: [] };
    }

    updateSessionStatus(sessionId, "executing");

    const mcpToolsForAgent = getMCPToolsForAISDK();

    const results = await Promise.all(
      assignments.map(async ({ tasks, context }, index) => {
        if (threadId) {
          broadcastToThread(threadId, {
            type: "sub_executor_started",
            sessionId,
            threadId,
            index,
            taskIds: tasks,
          });
        }

        try {
          const result = await runExecutorSubAgent(
            tasks,
            context,
            sessionId,
            apiKey,
            mcpToolsForAgent
          );
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_executor_done",
              sessionId,
              threadId,
              index,
              taskIds: tasks,
              summary: result.summary,
              success: result.success,
            });
          }
          return result;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          if (threadId) {
            broadcastToThread(threadId, {
              type: "sub_executor_done",
              sessionId,
              threadId,
              index,
              taskIds: tasks,
              summary: `Error: ${errorMsg}`,
              success: false,
            });
          }
          return {
            taskIds: tasks,
            success: false,
            summary: `Error: ${errorMsg}`,
            errors: [errorMsg],
          };
        }
      })
    );

    return { results };
  },
});

// =============================================================================
// Main Orchestration Pipeline
// =============================================================================

export async function runOrchestrationPipeline(
  session: AgentSession,
  task: string,
  apiKey: string,
  perplexityApiKey: string | null | undefined
): Promise<OrchestrationResult> {
  const planResult = await runPlanAgent(session, task, apiKey, perplexityApiKey);

  if (!planResult.success) {
    return {
      success: false,
      summary: planResult.summary,
      tasksSummary: getTasksSummary(session),
      error: planResult.error,
    };
  }

  const pendingExecuteTasks = Array.from(session.tasks.values()).filter(
    (t) => t.type === "execute" && (t.status === "staged" || t.status === "in_progress")
  );

  if (pendingExecuteTasks.length > 0) {
    const execResult = await runExecutorAgent(session, apiKey, perplexityApiKey);
    return {
      success: execResult.success,
      summary: execResult.summary,
      tasksSummary: getTasksSummary(session),
      error: execResult.error,
    };
  }

  return {
    success: true,
    summary: planResult.summary,
    tasksSummary: getTasksSummary(session),
  };
}
