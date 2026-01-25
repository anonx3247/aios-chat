import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { useChatRuntime } from "@app/hooks/useChatRuntime";

interface ChatThreadProps {
  threadId: string | null;
  onTitleGenerated?: (title: string) => void;
}

export function ChatThread({ threadId, onTitleGenerated }: ChatThreadProps) {
  const runtime = useChatRuntime({ threadId, onTitleGenerated });

  if (threadId === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500">
          Select a conversation or start a new one
        </p>
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full flex-col">
        <ThreadPrimitive.Root className="flex-1 overflow-y-auto">
          <ThreadPrimitive.Viewport className="flex flex-col gap-4 px-4 pt-8 pb-4">
            <ThreadPrimitive.Empty>
              <div className="flex h-full items-center justify-center">
                <p className="text-zinc-500">Send a message to start</p>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{
                UserMessage: UserMessage,
                AssistantMessage: AssistantMessage,
              }}
            />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>

        <div className="border-t border-zinc-800 p-4">
          <ComposerPrimitive.Root className="flex items-end gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2">
            <ComposerPrimitive.Input
              placeholder="Type a message..."
              className="flex-1 resize-none bg-transparent text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <ComposerPrimitive.Send className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Send
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-blue-600 px-4 py-2 text-white">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[80%] rounded-lg bg-zinc-800 px-4 py-2 text-zinc-100">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}
