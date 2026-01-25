import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { Message } from "@app/types/message";
import { usePersistence } from "./usePersistence";
import { getApiKey, streamChatResponse } from "@app/lib/ai";

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

interface StreamingState {
  content: string;
  isStreaming: boolean;
}

export function useChatRuntime({
  threadId,
  onTitleGenerated,
}: UseChatRuntimeOptions) {
  const { messages, saveMessage, refresh } = usePersistence(threadId);
  const [isRunning, setIsRunning] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState>({
    content: "",
    isStreaming: false,
  });
  const abortRef = useRef<boolean>(false);

  const threadMessages = useMemo(() => {
    const converted = messages.map(convertToThreadMessage);
    // Add streaming message if we're currently streaming
    if (streaming.isStreaming) {
      converted.push({
        id: "streaming",
        role: "assistant",
        content: streaming.content,
        status: { type: "running" },
      });
    }
    return converted;
  }, [messages, streaming]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (threadId === null) return;

      // Check for API key
      const apiKey = getApiKey();
      if (apiKey === null || apiKey === "") {
        await saveMessage({
          role: "assistant",
          content:
            "Please set your Anthropic API key in settings (gear icon) to use AI features.",
        });
        await refresh();
        return;
      }

      // Extract text content from the message
      const textContent = message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (textContent.length === 0) return;

      flushSync(() => {
        setIsRunning(true);
        setStreaming({ content: "", isStreaming: true });
      });
      abortRef.current = false;

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

        // Prepare chat history for API
        const chatHistory = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: textContent },
        ];

        // Stream the response
        let accumulated = "";
        const fullResponse = await streamChatResponse(
          chatHistory,
          (chunk) => {
            if (!abortRef.current) {
              accumulated += chunk;
              // Use flushSync to force immediate render
              flushSync(() => {
                setStreaming({ content: accumulated, isStreaming: true });
              });
            }
          }
        );

        // Save the complete response
        flushSync(() => {
          setStreaming({ content: "", isStreaming: false });
        });
        await saveMessage({
          role: "assistant",
          content: fullResponse,
        });

        await refresh();
      } catch (error) {
        flushSync(() => {
          setStreaming({ content: "", isStreaming: false });
        });
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        await saveMessage({
          role: "assistant",
          content: `Error: ${errorMessage}`,
        });
        await refresh();
      } finally {
        setIsRunning(false);
      }
    },
    [threadId, messages, saveMessage, refresh, onTitleGenerated]
  );

  const onCancel = useCallback((): Promise<void> => {
    abortRef.current = true;
    setIsRunning(false);
    setStreaming({ content: "", isStreaming: false });
    return Promise.resolve();
  }, []);

  return useExternalStoreRuntime({
    isRunning,
    messages: threadMessages,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
    onCancel,
  });
}
