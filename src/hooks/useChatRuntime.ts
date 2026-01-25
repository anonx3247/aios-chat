import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { Message } from "@app/types/message";
import { usePersistence } from "./usePersistence";
import { getApiKey, streamChatResponse, generateConversationTitle, type ToolInvocation } from "@app/lib/ai";

function convertToThreadMessage(message: Message, hideFromUI = false): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt),
    // Store tool invocations and hidden flag in metadata.custom for custom rendering
    metadata: {
      custom: {
        ...(message.toolInvocations !== undefined && message.toolInvocations.length > 0
          ? { toolInvocations: message.toolInvocations }
          : {}),
        ...(hideFromUI ? { hidden: true } : {}),
      },
    },
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
  toolInvocations: ToolInvocation[];
}

// Create a simple external store for streaming state
function createStreamingStore() {
  let state: StreamingStore = { content: "", isStreaming: false, isRunning: false, toolInvocations: [] };
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
      store.setState({ isRunning: false, isStreaming: false, content: "", toolInvocations: [] });
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
  // Filter out hidden messages (form submissions sent to AI)
  const FORM_SUBMISSION_PREFIX = "[Form submission]:";
  const threadMessages: ThreadMessageLike[] = messages
    .filter((m) => !m.content.startsWith(FORM_SUBMISSION_PREFIX))
    .map((m) => convertToThreadMessage(m));

  // Show streaming message with current tool invocations if we're running
  if (streamingState.isRunning) {
    threadMessages.push({
      id: "streaming",
      role: "assistant",
      content: streamingState.content,
      status: { type: "running" },
      metadata: streamingState.toolInvocations.length > 0
        ? { custom: { toolInvocations: streamingState.toolInvocations } }
        : undefined,
    });
  }

  // Core function to send a message
  const sendMessageInternal = useCallback(
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
      store.setState({ isRunning: true, isStreaming: false, content: "", toolInvocations: [] });
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

        // Stream the response with tool invocation callbacks
        let accumulated = "";
        const result = await streamChatResponse(
          chatHistory,
          (chunk) => {
            // Check if still on same thread and not aborted
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              accumulated += chunk;
              store.setState({ content: accumulated });
            }
          },
          (invocation) => {
            // Update tool invocations as they come in
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              const currentInvocations = store.getState().toolInvocations;
              const existingIndex = currentInvocations.findIndex(
                (i) => i.toolCallId === invocation.toolCallId
              );
              if (existingIndex >= 0) {
                // Update existing invocation
                const updated = [...currentInvocations];
                updated[existingIndex] = invocation;
                store.setState({ toolInvocations: updated });
              } else {
                // Add new invocation
                store.setState({ toolInvocations: [...currentInvocations, invocation] });
              }
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

        // Then save assistant response (with tool invocations if any)
        const assistantMessage: { role: "assistant"; content: string; toolInvocations?: ToolInvocation[] } = {
          role: "assistant",
          content: result.text,
        };
        if (result.toolInvocations.length > 0) {
          assistantMessage.toolInvocations = result.toolInvocations;
        }
        await saveMessage(assistantMessage);

        // Generate AI title after first exchange
        if (isFirstMessage && onTitleGenerated !== undefined) {
          try {
            const title = await generateConversationTitle(textContent, result.text);
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
          store.setState({ isStreaming: false, content: "", toolInvocations: [] });
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

  // Public send message function
  const sendMessage = useCallback(
    (textContent: string) => sendMessageInternal(textContent),
    [sendMessageInternal]
  );

  // Handle form submissions from dynamic UI components
  // These are filtered from UI display by their content prefix
  const handleFormSubmit = useCallback(
    (data: unknown) => {
      const formattedData = `[Form submission]: ${JSON.stringify(data, null, 2)}`;
      void sendMessageInternal(formattedData);
    },
    [sendMessageInternal]
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
    store.setState({ isRunning: false, isStreaming: false, content: "", toolInvocations: [] });
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

  // Return runtime plus form submit handler
  const runtime = useExternalStoreRuntime({
    isRunning: streamingState.isRunning,
    messages: threadMessages,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
    onCancel,
  });

  return { runtime, handleFormSubmit, streamingToolInvocations: streamingState.toolInvocations };
}
