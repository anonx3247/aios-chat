/**
 * ToolDisplay - Universal tool invocation renderer
 *
 * Routes tool invocations to appropriate display components based on tool name.
 */
import type { ToolInvocation } from "@app/types/message";
import { PerplexityDisplay } from "./tools/PerplexityDisplay";
import { EmbedDisplay } from "./tools/EmbedDisplay";
import { AskUserDisplay } from "./tools/AskUserDisplay";
import { FilesystemDisplay } from "./tools/FilesystemDisplay";
import { FetchDisplay } from "./tools/FetchDisplay";
import { TimeDisplay } from "./tools/TimeDisplay";
import { ExploreDisplay } from "./tools/ExploreDisplay";
import { ExecuteDisplay } from "./tools/ExecuteDisplay";
import { GenericToolDisplay } from "./tools/GenericToolDisplay";
import { ConfigureSettingsDisplay } from "./tools/ConfigureSettingsDisplay";

interface ToolDisplayProps {
  toolInvocation: ToolInvocation;
}

export function ToolDisplay({ toolInvocation }: ToolDisplayProps) {
  const { toolName } = toolInvocation;

  // Route to appropriate display component
  if (toolName.startsWith("perplexity_")) {
    return <PerplexityDisplay toolInvocation={toolInvocation} />;
  }

  if (toolName === "embed") {
    return <EmbedDisplay toolInvocation={toolInvocation} />;
  }

  if (toolName === "ask_user") {
    return <AskUserDisplay toolInvocation={toolInvocation} />;
  }

  if (toolName === "configure_settings") {
    return <ConfigureSettingsDisplay toolInvocation={toolInvocation} />;
  }

  // MCP tool displays
  if (toolName.startsWith("filesystem_")) {
    return <FilesystemDisplay toolInvocation={toolInvocation} />;
  }

  if (toolName.startsWith("fetch_")) {
    return <FetchDisplay toolInvocation={toolInvocation} />;
  }

  if (toolName.startsWith("time_")) {
    return <TimeDisplay toolInvocation={toolInvocation} />;
  }

  // Agent orchestration tools
  if (toolName === "explore") {
    return <ExploreDisplay toolInvocation={toolInvocation} />;
  }

  if (toolName === "execute") {
    return <ExecuteDisplay toolInvocation={toolInvocation} />;
  }

  // Generic display for other tools
  return <GenericToolDisplay toolInvocation={toolInvocation} />;
}
