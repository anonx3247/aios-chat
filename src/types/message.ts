export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "partial-call" | "call" | "result";
  result?: unknown;
}

export interface Message {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ToolInvocation[];
  createdAt: string;
}

export interface NewMessage {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: ToolInvocation[];
}
