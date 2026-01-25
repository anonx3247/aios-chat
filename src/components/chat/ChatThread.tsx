import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useThreadRuntime,
} from "@assistant-ui/react";
import { Send } from "lucide-react";
import { useChatRuntime } from "@app/hooks/useChatRuntime";
import { Markdown } from "./Markdown";

interface ChatThreadProps {
  threadId: string | null;
  onTitleGenerated?: (title: string) => void;
}

export function ChatThread({ threadId, onTitleGenerated }: ChatThreadProps) {
  const runtime = useChatRuntime({ threadId, onTitleGenerated });

  if (threadId === null) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-900">
        <div className="text-center">
          <div className="mb-4 text-6xl">💬</div>
          <h2 className="mb-2 text-xl font-semibold text-zinc-100">
            Welcome to AIOS Chat
          </h2>
          <p className="text-zinc-500">
            Click "New Chat" to start a conversation
          </p>
        </div>
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadContent />
    </AssistantRuntimeProvider>
  );
}

function ThreadContent() {
  return (
    <div className="flex h-full flex-col bg-zinc-900">
      <ThreadPrimitive.Root className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Viewport className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
          <ThreadPrimitive.Empty>
            <div className="flex h-full flex-col items-center justify-center py-16">
              <div className="mb-4 text-5xl">✨</div>
              <h3 className="mb-2 text-lg font-medium text-zinc-100">
                How can I help you today?
              </h3>
              <p className="text-sm text-zinc-500">
                Type a message below to get started
              </p>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage: UserMessage,
              AssistantMessage: AssistantMessage,
            }}
          />
          <ThreadPrimitive.If running>
            <ThinkingIndicator />
          </ThreadPrimitive.If>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      <div className="border-t border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <ComposerPrimitive.Root className="relative flex items-end rounded-2xl border border-zinc-700 bg-zinc-800 shadow-lg transition-colors focus-within:border-zinc-600">
            <ComposerPrimitive.Input
              placeholder="Message AIOS..."
              className="min-h-[52px] flex-1 resize-none bg-transparent px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              autoFocus
            />
            <ComposerPrimitive.Send className="m-2 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500">
              <Send className="h-4 w-4" />
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
          <p className="mt-2 text-center text-xs text-zinc-600">
            AI can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  const runtime = useThreadRuntime();
  const messages = runtime.getState().messages;
  const lastMessage = messages[messages.length - 1];

  // Don't show thinking indicator if we already have streaming content
  if (lastMessage?.role === "assistant" && lastMessage.id === "streaming") {
    const content = lastMessage.content[0];
    if (content?.type === "text" && content.text.length > 0) {
      return null;
    }
  }

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-sm font-medium text-white shadow-md">
          AI
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-zinc-800 px-4 py-3">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500" />
          </div>
          <span className="text-sm text-zinc-500">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-md">
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => <Markdown content={text} />,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="flex max-w-[85%] gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-sm font-medium text-white shadow-md">
          AI
        </div>
        <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100 shadow-md">
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => <Markdown content={text} />,
            }}
          />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
