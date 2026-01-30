/**
 * Built-in Tools
 *
 * Tools that don't depend on external MCP servers:
 * ask_user, configure_settings, embed, task management, complex orchestration.
 */
import { tool, type CoreTool } from "ai";
import { z } from "zod";
import {
  getAgentContext,
  setAgentContext,
  createAgentSession,
  addTaskToSession,
  updateTaskStatus,
  getSessionTasks,
  clearCompletedTasks,
} from "../agent/sessions.js";
import { runOrchestrationPipeline } from "../agent/orchestrator.js";
import type { AgentTaskStatus } from "../types.js";

// =============================================================================
// User Interaction Tools
// =============================================================================

export const askUserTool = tool({
  description: `Ask the user a question and wait for their response. The UI will appear inline above the chat input.

Types:
- confirm: Yes/No question
- single_select: Choose one option from a list
- multi_select: Choose multiple options from a list
- text: Free text input

The tool returns immediately with "awaiting_user_input" status. The user's response will be sent as a follow-up message.`,
  parameters: z.object({
    question: z.string().describe("The question to ask the user"),
    type: z
      .enum(["confirm", "single_select", "multi_select", "text"])
      .describe("Type of input to collect"),
    options: z
      .array(
        z.object({
          value: z.string().describe("The value returned when selected"),
          label: z.string().describe("Display label for the option"),
          description: z.string().optional().describe("Optional description shown below label"),
        })
      )
      .optional()
      .describe("Options for single_select or multi_select types"),
    page_size: z.number().optional().describe("Number of options per page (default 5)"),
    placeholder: z.string().optional().describe("Placeholder text for text input"),
    allow_cancel: z.boolean().optional().describe("Allow user to cancel/skip (default true)"),
  }),
  execute: async (args) => {
    return { status: "awaiting_user_input", ...args };
  },
});

export const configureSettingsTool = tool({
  description: `Request user to configure specific settings inline. Use when you need API keys, email credentials, or other configuration before proceeding with a task.

Settings keys (hierarchical dot-notation):
- "settings.provider": AI provider selection (Ollama/Anthropic)
- "settings.keys": All API keys
- "settings.keys.anthropic": Anthropic API key only
- "settings.keys.perplexity": Perplexity API key only
- "settings.keys.firecrawl": Firecrawl API key only (for web fetch & search)
- "settings.email": Full email settings (address, password, IMAP, SMTP)
- "settings.email.password": Email password only
- "settings.email.imap": IMAP host/port/security only
- "settings.email.smtp": SMTP host/port/security only

Legacy flat keys also supported: "email", "perplexity", "anthropic", "ollama"

The tool returns with awaiting_user_input=true. The user will fill out a form in the chat UI, then you can retry the operation.`,
  parameters: z.object({
    settings_key: z
      .string()
      .describe("Which settings to configure (dot-notation key like 'settings.email.password' or legacy flat key like 'email')"),
    reason: z.string().describe("Brief explanation of why this setting is needed"),
  }),
  execute: async ({ settings_key, reason }) => {
    return { settings_key, reason, awaiting_user_input: true };
  },
});

// =============================================================================
// Embed Tool
// =============================================================================

interface EmbedInfo {
  provider: string;
  type: string;
  embed_url?: string;
  id?: string;
  oembed_url?: string;
}

function parseEmbedUrl(url: string): EmbedInfo {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace("www.", "");

    // YouTube
    if (hostname === "youtube.com" || hostname === "youtu.be") {
      const videoId =
        hostname === "youtu.be"
          ? urlObj.pathname.slice(1).split("?")[0]
          : urlObj.searchParams.get("v");
      if (videoId) {
        return {
          provider: "youtube",
          type: "video",
          id: videoId,
          embed_url: `https://www.youtube.com/embed/${videoId}`,
        };
      }
    }

    // Spotify
    if (hostname === "open.spotify.com") {
      const match = urlObj.pathname.match(/\/(track|album|playlist|episode|show)\/([^/?]+)/);
      if (match) {
        return {
          provider: "spotify",
          type: match[1],
          id: match[2],
          embed_url: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        };
      }
    }

    // Google Maps
    if (
      (hostname === "google.com" || hostname === "maps.google.com") &&
      (urlObj.pathname.includes("/maps") || hostname === "maps.google.com")
    ) {
      const placeMatch = urlObj.pathname.match(/place\/([^/]+)/);
      const coordMatch = urlObj.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

      if (placeMatch || coordMatch) {
        return {
          provider: "google_maps",
          type: "map",
          embed_url: `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(placeMatch ? placeMatch[1] : `${coordMatch![1]},${coordMatch![2]}`)}`,
        };
      }

      return {
        provider: "google_maps",
        type: "map",
        embed_url: url.replace("/maps/", "/maps/embed?pb="),
      };
    }

    // Twitter/X
    if (hostname === "twitter.com" || hostname === "x.com") {
      const tweetMatch = urlObj.pathname.match(/\/([^/]+)\/status\/(\d+)/);
      if (tweetMatch) {
        return {
          provider: "twitter",
          type: "tweet",
          id: tweetMatch[2],
          oembed_url: `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
        };
      }
    }

    // Instagram
    if (hostname === "instagram.com") {
      const postMatch = urlObj.pathname.match(/\/(p|reel)\/([^/?]+)/);
      if (postMatch) {
        return {
          provider: "instagram",
          type: postMatch[1] === "reel" ? "reel" : "post",
          id: postMatch[2],
          oembed_url: `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`,
        };
      }
    }

    // TikTok
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
      const videoMatch = urlObj.pathname.match(/\/@[^/]+\/video\/(\d+)/);
      if (videoMatch) {
        return {
          provider: "tiktok",
          type: "video",
          id: videoMatch[1],
          oembed_url: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        };
      }
    }

    // Facebook
    if (hostname === "facebook.com" || hostname === "fb.com") {
      return {
        provider: "facebook",
        type: "post",
        oembed_url: `https://www.facebook.com/plugins/post/oembed.json/?url=${encodeURIComponent(url)}`,
      };
    }

    // LinkedIn
    if (hostname === "linkedin.com") {
      return { provider: "linkedin", type: "post" };
    }

    return { provider: "link", type: "link" };
  } catch {
    return { provider: "link", type: "link" };
  }
}

export const embedTool = tool({
  description: `Embed web content inline in the chat. Supports:
- YouTube videos (youtube.com, youtu.be)
- Spotify tracks/playlists/albums (open.spotify.com)
- Google Maps locations and directions (google.com/maps)
- Twitter/X posts (twitter.com, x.com)
- Instagram posts and reels (instagram.com)
- TikTok videos (tiktok.com)
- Facebook posts (facebook.com)
- LinkedIn posts (linkedin.com)

Use this when sharing relevant media content or locations.`,
  parameters: z.object({
    url: z.string().url().describe("The URL to embed"),
    title: z.string().optional().describe("Optional title/caption for the embed"),
  }),
  execute: async ({ url, title }) => {
    const embedInfo = parseEmbedUrl(url);
    return { url, title, ...embedInfo };
  },
});

// =============================================================================
// Agent Task Management Tools
// =============================================================================

export const addTaskTool = tool({
  description: `Add a task to track during this agent session.

Use this to break down complex work into trackable steps.
Each task should be specific and actionable.`,
  parameters: z.object({
    title: z.string().describe("Short task title"),
    description: z.string().describe("Detailed description of what to do"),
    type: z.enum(["plan", "explore", "execute"]).describe("Task category"),
  }),
  execute: async ({ title, description, type }) => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session" };
    }
    const task = addTaskToSession(sessionId, title, description, type);
    return { taskId: task.id, status: "created" };
  },
});

export const setTaskTool = tool({
  description: `Update a task's status.

Use 'in_progress' when starting work on a task.
Use 'done' when the task is complete.
Use 'cancelled' if the task cannot be completed.`,
  parameters: z.object({
    taskId: z.string().describe("The task ID to update"),
    status: z
      .enum(["staged", "in_progress", "done", "cancelled"])
      .describe("New status"),
    result: z.unknown().optional().describe("Result data when marking done"),
  }),
  execute: async ({ taskId, status, result }) => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session" };
    }
    updateTaskStatus(sessionId, taskId, status, result);
    return { taskId, status, updated: true };
  },
});

export const viewTasksTool = tool({
  description: "View all tasks in the current agent session.",
  parameters: z.object({
    filter: z
      .enum(["all", "pending", "in_progress", "done"])
      .optional()
      .describe("Filter by status"),
  }),
  execute: async ({ filter }) => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session", tasks: [] };
    }
    let tasks = getSessionTasks(sessionId);
    if (filter && filter !== "all") {
      const statusMap: Record<string, AgentTaskStatus[]> = {
        pending: ["staged"],
        in_progress: ["in_progress"],
        done: ["done", "cancelled"],
      };
      const statuses = statusMap[filter];
      tasks = tasks.filter((t) => statuses.includes(t.status));
    }
    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
      })),
    };
  },
});

export const clearTasksTool = tool({
  description: "Clear completed and cancelled tasks from the list.",
  parameters: z.object({}),
  execute: async () => {
    const { sessionId } = getAgentContext();
    if (!sessionId) {
      return { error: "No active agent session" };
    }
    clearCompletedTasks(sessionId);
    return { cleared: true };
  },
});

export const summarizeFindingsTool = tool({
  description:
    "Submit your exploration findings. This ends your task and returns results to the parent agent.",
  parameters: z.object({
    summary: z.string().describe("Concise summary of what you found"),
    details: z.string().optional().describe("Additional details if needed"),
    sources: z.array(z.string()).optional().describe("URLs or file paths consulted"),
  }),
  execute: async ({ summary, details, sources }) => {
    return { summary, details, sources };
  },
});

export const reportCompletionTool = tool({
  description:
    "Report completion of your assigned tasks. This ends your work and returns results to the parent agent.",
  parameters: z.object({
    success: z.boolean().describe("Whether all tasks completed successfully"),
    summary: z.string().describe("Summary of what was done"),
    errors: z.array(z.string()).optional().describe("Any errors encountered"),
  }),
  execute: async ({ success, summary, errors }) => {
    return { success, summary, errors };
  },
});

// =============================================================================
// Complex Tool (triggers orchestration)
// =============================================================================

export const complexTool = tool({
  description: `Trigger the multi-agent orchestration system for complex tasks.

Use this when a task requires:
- Multiple steps or sub-tasks
- Research or information gathering first
- File modifications across multiple files
- Parallel work streams
- Breaking down into trackable progress

Do NOT use for:
- Simple questions or clarifications
- Single-step operations
- Small, direct edits

This tool will plan and execute the task, then return the final result.
Progress will be shown in the task panel while work is ongoing.`,
  parameters: z.object({
    task: z.string().describe("Description of the complex task to plan and execute"),
  }),
  execute: async ({ task }) => {
    const { threadId, apiKey, perplexityApiKey } = getAgentContext();
    if (!threadId) {
      return { error: "No thread context available", success: false };
    }
    if (!apiKey) {
      return { error: "No API key available for plan agent", success: false };
    }

    const session = createAgentSession(threadId);
    session.planContent = task;
    setAgentContext({ sessionId: session.id, threadId, apiKey, perplexityApiKey });

    try {
      return await runOrchestrationPipeline(session, task, apiKey, perplexityApiKey);
    } catch (err) {
      console.error("[ComplexTool] Orchestration error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        summary: "Orchestration failed",
        tasksSummary: [],
      };
    }
  },
});

// =============================================================================
// Sidebar Content Tools
// =============================================================================

export const showContentTool = tool({
  description: `Display rich content in the sidebar viewer. Use for reports, analysis, detailed results, code reviews, or any content too long for chat. Supports markdown and LaTeX (KaTeX via $...$ and $$...$$).`,
  parameters: z.object({
    title: z.string().describe("Document title shown in the panel header"),
    content: z.string().describe("Markdown content (supports LaTeX via $...$ and $$...$$)"),
  }),
  execute: async ({ title, content }) => {
    return { title, content, display: "sidebar_content" };
  },
});

export const showDocumentTool = tool({
  description: `Open a file or webpage in the sidebar viewer. Supports: markdown files, code files (syntax highlighted), PDFs, and web URLs (rendered in webview).`,
  parameters: z.object({
    uri: z.string().describe("URI to display: file:///path/to/file or https://example.com"),
    title: z.string().optional().describe("Optional title override for the panel header"),
  }),
  execute: async ({ uri, title }) => {
    return { uri, title, display: "sidebar_document" };
  },
});

// =============================================================================
// Personality Tool
// =============================================================================

export const updatePersonalityTool = tool({
  description: `Suggest a change to your personality/behavior prompt. The user will see the proposed change and can accept or reject it.`,
  parameters: z.object({
    suggestion: z.string().describe("The proposed personality text or modification"),
    reason: z.string().describe("Why this change would be helpful"),
  }),
  execute: async ({ suggestion, reason }) => {
    return { suggestion, reason, awaiting_user_input: true, type: "personality_update" };
  },
});

/**
 * Get all built-in tools as a record
 */
export function getBuiltinTools(): Record<string, CoreTool> {
  return {
    ask_user: askUserTool,
    embed: embedTool,
    configure_settings: configureSettingsTool,
    complex: complexTool,
    show_content: showContentTool,
    show_document: showDocumentTool,
    update_personality: updatePersonalityTool,
  };
}
