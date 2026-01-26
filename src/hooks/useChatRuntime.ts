import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { Message } from "@app/types/message";
import { usePersistence } from "./usePersistence";
import { getApiKey, streamChatResponse, generateConversationTitle, type ToolInvocation, type ChatMessage } from "@app/lib/ai";

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

interface AskUserArgs {
  question: string;
  type: "confirm" | "single_select" | "multi_select" | "text";
  options?: { value: string; label: string; description?: string }[];
  page_size?: number;
  placeholder?: string;
  allow_cancel?: boolean;
}

interface PendingAskUser {
  toolCallId: string;
  args: AskUserArgs;
  // Store the full state when ask_user was called
  userMessageContent: string; // The original user message that triggered this
  assistantContent: string;
  assistantToolInvocations: ToolInvocation[];
  isFirstMessage: boolean; // Whether this was the first message in the thread
  // Store the chat history at the time of the ask_user call (excluding the tool result)
  chatHistorySnapshot: ChatMessage[];
}

interface StreamingStore {
  content: string;
  isStreaming: boolean;
  isRunning: boolean;
  toolInvocations: ToolInvocation[];
  pendingAskUser: PendingAskUser | null;
  pendingUserMessage: string | null; // Show user message optimistically during streaming
}

// Create a simple external store for streaming state
function createStreamingStore() {
  let state: StreamingStore = { content: "", isStreaming: false, isRunning: false, toolInvocations: [], pendingAskUser: null, pendingUserMessage: null };
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
  const { messages, saveMessage, deleteMessage, refresh } = usePersistence(threadId);
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
      store.setState({ isRunning: false, isStreaming: false, content: "", toolInvocations: [], pendingAskUser: null, pendingUserMessage: null });
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

  // Show pending user message optimistically during streaming
  if (streamingState.pendingUserMessage !== null) {
    threadMessages.push({
      id: "pending-user",
      role: "user",
      content: streamingState.pendingUserMessage,
      createdAt: new Date(),
    });
  }

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
  // toolResult is used when continuing from an ask_user response
  const sendMessageInternal = useCallback(
    async (
      textContent: string,
      toolResult?: { toolCallId: string; result: unknown }
    ) => {
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

      if (textContent.length === 0 && toolResult === undefined) return;

      // Set running immediately to show thinking indicator
      // Also set pending user message to show it optimistically during streaming
      store.setState({
        isRunning: true,
        isStreaming: false,
        content: "",
        toolInvocations: [],
        pendingUserMessage: toolResult === undefined && textContent.length > 0 ? textContent : null,
      });
      abortRef.current = false;

      // Track user message content for ask_user pending state
      const userMessageContent = textContent;

      try {
        // Check if we're still on the same thread
        if (activeThreadIdRef.current !== requestThreadId) {
          abortRef.current = true;
          return;
        }

        const isFirstMessage = messages.length === 0;

        // Save user message FIRST (before API call) so it's not lost on errors
        // Skip if this is a tool result continuation or regeneration
        if (toolResult === undefined && textContent.length > 0) {
          await saveMessage({
            role: "user",
            content: textContent,
          });
          await refresh();
          // Clear pending user message since it's now persisted
          store.setState({ pendingUserMessage: null });
        }

        // Prepare chat history for API
        const chatHistory: ChatMessage[] = messages.map((m) => {
          const msg: ChatMessage = { role: m.role, content: m.content };
          if (m.toolInvocations !== undefined && m.toolInvocations.length > 0) {
            msg.toolInvocations = m.toolInvocations;
          }
          return msg;
        });

        // Add the current message to chat history for API call
        if (toolResult !== undefined) {
          // Continuing from ask_user - send tool result
          chatHistory.push({
            role: "user",
            content: "",
            toolResults: [toolResult],
          });
        } else if (textContent.length > 0) {
          // Normal user message (already saved above, add to history for API)
          chatHistory.push({ role: "user", content: textContent });
        }

        // Now start streaming
        store.setState({ isStreaming: true });

        // Stream the response with tool invocation callbacks
        let accumulated = "";
        let pendingAskUserData: PendingAskUser | null = null;
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

              // Check if this is an ask_user tool that completed with awaiting_user_input
              if (
                invocation.toolName === "ask_user" &&
                invocation.state === "result" &&
                invocation.result !== null &&
                typeof invocation.result === "object" &&
                "status" in invocation.result &&
                (invocation.result as { status: string }).status === "awaiting_user_input"
              ) {
                // Get current state to capture assistant's message
                const currentState = store.getState();
                pendingAskUserData = {
                  toolCallId: invocation.toolCallId,
                  args: invocation.args as unknown as AskUserArgs,
                  userMessageContent,
                  assistantContent: currentState.content,
                  assistantToolInvocations: currentState.toolInvocations,
                  isFirstMessage,
                  // Snapshot the chat history so we can continue from it
                  chatHistorySnapshot: chatHistory,
                };
                store.setState({ pendingAskUser: pendingAskUserData });
              }
            }
          }
        );

        // Only save if still on the same thread
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
        if (activeThreadIdRef.current !== requestThreadId || abortRef.current) {
          return;
        }

        // Debug: log result
        console.log("[useChatRuntime] Stream complete, result.text:", result.text, "accumulated:", accumulated, "toolInvocations:", result.toolInvocations);

        // Now save both messages to DB after streaming is complete
        // Keep content visible until messages are saved to avoid flash of empty content
        store.setState({ isStreaming: false });

        // DON'T save if ask_user is pending - we'll save when user responds
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pendingAskUserData is mutated in callback
        if (pendingAskUserData !== null) {
          return;
        }

        // Save assistant response (user message was already saved before API call)
        const assistantMessage: { role: "assistant"; content: string; toolInvocations?: ToolInvocation[] } = {
          role: "assistant",
          content: result.text,
        };
        if (result.toolInvocations.length > 0) {
          assistantMessage.toolInvocations = result.toolInvocations;
        }
        await saveMessage(assistantMessage);

        // Generate AI title after first exchange (only for actual user messages)
        if (isFirstMessage && toolResult === undefined && onTitleGenerated !== undefined) {
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

        // Clear streaming state now that messages are persisted
        store.setState({ content: "", pendingUserMessage: null });
      } catch (error) {
        // Only update state if still on same thread
        if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
          store.setState({ isStreaming: false, content: "", toolInvocations: [], pendingUserMessage: null });
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

  // Continue conversation after ask_user response (uses snapshot to avoid race conditions)
  const continueFromAskUser = useCallback(
    async (pending: PendingAskUser, response: unknown) => {
      if (threadId === null) return;

      const requestThreadId = threadId;

      // Check for API key
      const apiKey = getApiKey();
      if (apiKey === null || apiKey === "") {
        await saveMessage({
          role: "assistant",
          content: "Please set your Anthropic API key in settings to use AI features.",
        });
        await refresh();
        return;
      }

      // Set running state
      store.setState({ isRunning: true, isStreaming: true, content: "", toolInvocations: [] });
      abortRef.current = false;

      try {
        // Build the full chat history from the snapshot
        // The snapshot already contains: previous messages + user message
        // We need to add: assistant message with tool call + tool result
        const chatHistory: ChatMessage[] = [
          ...pending.chatHistorySnapshot,
          // Add assistant message with the tool invocation
          {
            role: "assistant" as const,
            content: pending.assistantContent,
            toolInvocations: pending.assistantToolInvocations,
          },
          // Add the tool result
          {
            role: "user" as const,
            content: "",
            toolResults: [{ toolCallId: pending.toolCallId, result: response }],
          },
        ];

        // Stream the response
        let accumulated = "";
        let newPendingAskUser: PendingAskUser | null = null;
        const result = await streamChatResponse(
          chatHistory,
          (chunk) => {
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              accumulated += chunk;
              store.setState({ content: accumulated });
            }
          },
          (invocation) => {
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              const currentInvocations = store.getState().toolInvocations;
              const existingIndex = currentInvocations.findIndex(
                (i) => i.toolCallId === invocation.toolCallId
              );
              if (existingIndex >= 0) {
                const updated = [...currentInvocations];
                updated[existingIndex] = invocation;
                store.setState({ toolInvocations: updated });
              } else {
                store.setState({ toolInvocations: [...currentInvocations, invocation] });
              }

              // Check for another ask_user
              if (
                invocation.toolName === "ask_user" &&
                invocation.state === "result" &&
                invocation.result !== null &&
                typeof invocation.result === "object" &&
                "status" in invocation.result &&
                (invocation.result as { status: string }).status === "awaiting_user_input"
              ) {
                const currentState = store.getState();
                newPendingAskUser = {
                  toolCallId: invocation.toolCallId,
                  args: invocation.args as unknown as AskUserArgs,
                  userMessageContent: "", // No new user message for chained ask_user
                  assistantContent: currentState.content,
                  assistantToolInvocations: currentState.toolInvocations,
                  isFirstMessage: false,
                  chatHistorySnapshot: chatHistory,
                };
                store.setState({ pendingAskUser: newPendingAskUser });
              }
            }
          }
        );

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- refs can be mutated asynchronously
        if (activeThreadIdRef.current !== requestThreadId || abortRef.current) {
          return;
        }

        store.setState({ isStreaming: false, content: "" });

        // If another ask_user is pending, don't save yet
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- newPendingAskUser is mutated in callback
        if (newPendingAskUser !== null) {
          return;
        }

        // Save the new assistant response
        const assistantMessage: { role: "assistant"; content: string; toolInvocations?: ToolInvocation[] } = {
          role: "assistant",
          content: result.text,
        };
        if (result.toolInvocations.length > 0) {
          assistantMessage.toolInvocations = result.toolInvocations;
        }
        await saveMessage(assistantMessage);
        await refresh();
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- refs can be mutated asynchronously
        if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
          store.setState({ isStreaming: false, content: "", toolInvocations: [] });
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          await saveMessage({
            role: "assistant",
            content: `Error: ${errorMessage}`,
          });
          await refresh();
        }
      } finally {
        if (activeThreadIdRef.current === requestThreadId) {
          store.setState({ isRunning: false });
        }
      }
    },
    [threadId, store, saveMessage, refresh]
  );

  // Handle ask_user responses
  // Save messages and continue with the tool result
  const handleAskUserSubmit = useCallback(
    async (response: unknown) => {
      const pending = store.getState().pendingAskUser;
      if (pending === null) return;

      // Clear pending state
      store.setState({ pendingAskUser: null });

      // Save the original user message that triggered the ask_user
      if (pending.userMessageContent.length > 0) {
        await saveMessage({
          role: "user",
          content: pending.userMessageContent,
        });
      }

      // Update the ask_user tool invocation with the actual user response
      const updatedToolInvocations = pending.assistantToolInvocations.map((inv) =>
        inv.toolCallId === pending.toolCallId
          ? { ...inv, result: response }
          : inv
      );

      // Save the assistant message with the updated tool invocation
      await saveMessage({
        role: "assistant",
        content: pending.assistantContent,
        toolInvocations: updatedToolInvocations,
      });

      // Generate title if this was the first message
      if (pending.isFirstMessage && onTitleGenerated !== undefined) {
        try {
          const title = await generateConversationTitle(
            pending.userMessageContent,
            pending.assistantContent
          );
          onTitleGenerated(title);
        } catch {
          const fallbackTitle =
            pending.userMessageContent.slice(0, 50) +
            (pending.userMessageContent.length > 50 ? "..." : "");
          onTitleGenerated(fallbackTitle);
        }
      }

      await refresh();

      // Continue the conversation using the snapshot (avoids race condition)
      void continueFromAskUser(pending, response);
    },
    [store, saveMessage, refresh, onTitleGenerated, continueFromAskUser]
  );

  const handleAskUserCancel = useCallback(async () => {
    const pending = store.getState().pendingAskUser;
    if (pending === null) {
      store.setState({ pendingAskUser: null });
      return;
    }

    store.setState({ pendingAskUser: null });

    // Save messages with "cancelled" result
    if (pending.userMessageContent.length > 0) {
      await saveMessage({
        role: "user",
        content: pending.userMessageContent,
      });
    }

    const updatedToolInvocations = pending.assistantToolInvocations.map((inv) =>
      inv.toolCallId === pending.toolCallId
        ? { ...inv, result: { cancelled: true } }
        : inv
    );

    await saveMessage({
      role: "assistant",
      content: pending.assistantContent,
      toolInvocations: updatedToolInvocations,
    });

    await refresh();

    // Continue with cancelled result using the snapshot
    void continueFromAskUser(pending, { cancelled: true });
  }, [store, saveMessage, refresh, continueFromAskUser]);

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
    store.setState({ isRunning: false, isStreaming: false, content: "", toolInvocations: [], pendingAskUser: null, pendingUserMessage: null });
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

  // Regenerate the last assistant message
  const regenerateLastMessage = useCallback(async () => {
    if (threadId === null || streamingState.isRunning) return;

    // Find the last assistant message and the user message before it
    // Use reverse iteration for compatibility (findLastIndex is ES2023)
    let lastAssistant: Message | undefined;
    let lastAssistantIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "assistant") {
        lastAssistant = msg;
        lastAssistantIndex = i;
        break;
      }
    }
    if (lastAssistant === undefined) return;

    // Find user message before the assistant message
    let userMessageBefore: Message | undefined;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "user") {
        userMessageBefore = msg;
        break;
      }
    }

    if (userMessageBefore === undefined) return;

    // Capture the ID before any async operations
    const lastAssistantId = lastAssistant.id;

    // Delete the last assistant message
    await deleteMessage(lastAssistantId);
    await refresh();

    // Re-send using the chat history (without the deleted message)
    // The sendMessageInternal will use the current messages state
    // We need to re-trigger with empty content since user message is already in history
    store.setState({
      isRunning: true,
      isStreaming: false,
      content: "",
      toolInvocations: [],
      pendingUserMessage: null,
    });
    abortRef.current = false;

    const requestThreadId = threadId;

    try {
      // Prepare chat history from remaining messages
      const chatHistory: ChatMessage[] = messages
        .filter((m) => m.id !== lastAssistantId)
        .map((m) => {
          const msg: ChatMessage = { role: m.role, content: m.content };
          if (m.toolInvocations !== undefined && m.toolInvocations.length > 0) {
            msg.toolInvocations = m.toolInvocations;
          }
          return msg;
        });

      store.setState({ isStreaming: true });

      let accumulated = "";
      const result = await streamChatResponse(
        chatHistory,
        (chunk) => {
          if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
            accumulated += chunk;
            store.setState({ content: accumulated });
          }
        },
        (invocation) => {
          if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
            const currentInvocations = store.getState().toolInvocations;
            const existingIndex = currentInvocations.findIndex(
              (i) => i.toolCallId === invocation.toolCallId
            );
            if (existingIndex >= 0) {
              const updated = [...currentInvocations];
              updated[existingIndex] = invocation;
              store.setState({ toolInvocations: updated });
            } else {
              store.setState({ toolInvocations: [...currentInvocations, invocation] });
            }
          }
        }
      );

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- refs can be mutated asynchronously
      if (activeThreadIdRef.current !== requestThreadId || abortRef.current) {
        return;
      }

      store.setState({ isStreaming: false });

      // Save the new assistant response
      const assistantMessage: { role: "assistant"; content: string; toolInvocations?: ToolInvocation[] } = {
        role: "assistant",
        content: result.text,
      };
      if (result.toolInvocations.length > 0) {
        assistantMessage.toolInvocations = result.toolInvocations;
      }
      await saveMessage(assistantMessage);
      await refresh();
      store.setState({ content: "" });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- refs can be mutated asynchronously
      if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
        store.setState({ isStreaming: false, content: "", toolInvocations: [] });
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        await saveMessage({
          role: "assistant",
          content: `Error: ${errorMessage}`,
        });
        await refresh();
      }
    } finally {
      if (activeThreadIdRef.current === requestThreadId) {
        store.setState({ isRunning: false });
      }
    }
  }, [threadId, messages, deleteMessage, refresh, saveMessage, store, streamingState.isRunning]);

  // Return runtime plus ask user handlers
  const runtime = useExternalStoreRuntime({
    isRunning: streamingState.isRunning,
    messages: threadMessages,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
    onCancel,
  });

  return {
    runtime,
    pendingAskUser: streamingState.pendingAskUser,
    handleAskUserSubmit,
    handleAskUserCancel,
    regenerateLastMessage,
  };
}
