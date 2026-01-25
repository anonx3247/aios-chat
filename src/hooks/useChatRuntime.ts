import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { Message } from "@app/types/message";
import { usePersistence } from "./usePersistence";
import { getApiKey, streamChatResponse, generateConversationTitle } from "@app/lib/ai";

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
  initialMessage?: string | null | undefined;
  onInitialMessageConsumed?: (() => void) | undefined;
}

interface StreamingStore {
  content: string;
  isStreaming: boolean;
  isRunning: boolean;
}

// Create a simple external store for streaming state
function createStreamingStore() {
  let state: StreamingStore = { content: "", isStreaming: false, isRunning: false };
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (newState: Partial<StreamingStore>) => {
      state = { ...state, ...newState };
      listeners.forEach((listener) => { listener(); });
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export function useChatRuntime({
  threadId,
  onTitleGenerated,
  initialMessage,
  onInitialMessageConsumed,
}: UseChatRuntimeOptions) {
  const { messages, saveMessage, refresh } = usePersistence(threadId);
  const abortRef = useRef<boolean>(false);
  const activeThreadIdRef = useRef<string | null>(null);

  // Use a ref to hold the store so it persists across renders
  const storeRef = useRef<ReturnType<typeof createStreamingStore> | null>(null);
  storeRef.current ??= createStreamingStore();
  const store = storeRef.current;

  // Reset streaming state when thread changes
  useEffect(() => {
    if (activeThreadIdRef.current !== threadId) {
      // Abort any ongoing streaming for the previous thread
      abortRef.current = true;
      store.setState({ isRunning: false, isStreaming: false, content: "" });
      activeThreadIdRef.current = threadId;
    }
  }, [threadId, store]);

  // Subscribe to store changes
  const streamingState = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState
  );

  // Build thread messages including streaming content
  const threadMessages: ThreadMessageLike[] = messages.map(convertToThreadMessage);
  // Show streaming message if we're streaming OR if we're running (thinking)
  if (streamingState.isRunning) {
    threadMessages.push({
      id: "streaming",
      role: "assistant",
      content: streamingState.content,
      status: { type: "running" },
    });
  }

  // Core function to send a message
  const sendMessage = useCallback(
    async (textContent: string) => {
      if (threadId === null) return;

      // Capture the thread ID at the start of the request
      const requestThreadId = threadId;

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

      if (textContent.length === 0) return;

      // Set running immediately to show thinking indicator
      store.setState({ isRunning: true, isStreaming: false, content: "" });
      abortRef.current = false;

      try {
        // Check if we're still on the same thread
        if (activeThreadIdRef.current !== requestThreadId) {
          abortRef.current = true;
          return;
        }

        const isFirstMessage = messages.length === 0;

        // Prepare chat history for API (include the new user message)
        const chatHistory = [
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: textContent },
        ];

        // Now start streaming
        store.setState({ isStreaming: true });

        // Stream the response - don't save to DB yet to avoid latency
        let accumulated = "";
        const fullResponse = await streamChatResponse(
          chatHistory,
          (chunk) => {
            // Check if still on same thread and not aborted
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              accumulated += chunk;
              store.setState({ content: accumulated });
            }
          }
        );

        // Only save if still on the same thread
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
        if (activeThreadIdRef.current !== requestThreadId || abortRef.current) {
          return;
        }

        // Now save both messages to DB after streaming is complete
        store.setState({ isStreaming: false, content: "" });

        // Save user message first
        await saveMessage({
          role: "user",
          content: textContent,
        });

        // Then save assistant response
        await saveMessage({
          role: "assistant",
          content: fullResponse,
        });

        // Generate AI title after first exchange
        if (isFirstMessage && onTitleGenerated !== undefined) {
          try {
            const title = await generateConversationTitle(textContent, fullResponse);
            onTitleGenerated(title);
          } catch {
            // Fall back to first message if title generation fails
            const fallbackTitle = textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "");
            onTitleGenerated(fallbackTitle);
          }
        }

        await refresh();
      } catch (error) {
        // Only update state if still on same thread
        if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
          store.setState({ isStreaming: false, content: "" });
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
          await saveMessage({
            role: "assistant",
            content: `Error: ${errorMessage}`,
          });
          await refresh();
        }
      } finally {
        // Only clear running if still on same thread
        if (activeThreadIdRef.current === requestThreadId) {
          store.setState({ isRunning: false });
        }
      }
    },
    [threadId, messages, saveMessage, refresh, onTitleGenerated, store]
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      // Extract text content from the message
      const textContent = message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      await sendMessage(textContent);
    },
    [sendMessage]
  );

  const onCancel = useCallback((): Promise<void> => {
    abortRef.current = true;
    store.setState({ isRunning: false, isStreaming: false, content: "" });
    return Promise.resolve();
  }, [store]);

  // Handle initial message from welcome screen
  const initialMessageProcessedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      initialMessage !== null &&
      initialMessage !== undefined &&
      threadId !== null &&
      initialMessageProcessedRef.current !== initialMessage
    ) {
      initialMessageProcessedRef.current = initialMessage;
      void sendMessage(initialMessage);
      onInitialMessageConsumed?.();
    }
  }, [initialMessage, threadId, sendMessage, onInitialMessageConsumed]);

  return useExternalStoreRuntime({
    isRunning: streamingState.isRunning,
    messages: threadMessages,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
    onCancel,
  });
}
