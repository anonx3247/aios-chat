import { useCallback, useMemo, useState } from "react";
import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { Message } from "@app/types/message";
import { usePersistence } from "./usePersistence";

function convertToThreadMessage(message: Message): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt),
  };
}

interface UseChatRuntimeOptions {
  threadId: string | null;
  onTitleGenerated?: ((title: string) => void) | undefined;
}

export function useChatRuntime({
  threadId,
  onTitleGenerated,
}: UseChatRuntimeOptions) {
  const { messages, saveMessage, refresh } = usePersistence(threadId);
  const [isRunning, setIsRunning] = useState(false);

  const threadMessages = useMemo(
    () => messages.map(convertToThreadMessage),
    [messages]
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (threadId === null) return;

      // Extract text content from the message
      const textContent = message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (textContent.length === 0) return;

      setIsRunning(true);
      try {
        // Save user message
        await saveMessage({
          role: "user",
          content: textContent,
        });

        // Generate title from first message if needed
        if (messages.length === 0 && onTitleGenerated !== undefined) {
          const title =
            textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "");
          onTitleGenerated(title);
        }

        // TODO: Integrate with AI SDK for actual response
        // For now, create a placeholder response
        await saveMessage({
          role: "assistant",
          content: "I'm a placeholder response. AI integration coming soon!",
        });

        await refresh();
      } finally {
        setIsRunning(false);
      }
    },
    [threadId, messages.length, saveMessage, refresh, onTitleGenerated]
  );

  return useExternalStoreRuntime({
    isRunning,
    messages: threadMessages,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
  });
}
