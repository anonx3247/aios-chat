import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { Message } from "@app/types/message";
import { usePersistence } from "./usePersistence";
import { getApiKey, streamChatResponse, generateConversationTitle, type ToolInvocation, type ChatMessage, type StreamResult } from "@app/lib/ai";

function convertToThreadMessage(message: Message, hideFromUI = false): ThreadMessageLike {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.createdAt),
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
  userMessageContent: string;
  assistantContent: string;
  assistantToolInvocations: ToolInvocation[];
  isFirstMessage: boolean;
  chatHistorySnapshot: ChatMessage[];
}

export type StreamingContentPart =
  | { type: "text"; text: string }
  | { type: "tool"; invocation: ToolInvocation };

interface StreamingStore {
  content: string;
  isStreaming: boolean;
  isRunning: boolean;
  toolInvocations: ToolInvocation[];
  contentParts: StreamingContentPart[];
  pendingAskUser: PendingAskUser | null;
  pendingUserMessage: string | null;
}

function createStreamingStore() {
  let state: StreamingStore = { content: "", isStreaming: false, isRunning: false, toolInvocations: [], contentParts: [], pendingAskUser: null, pendingUserMessage: null };
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

// No hard limit on tool loop iterations — user can stop via cancel button

/**
 * Check if an invocation is an ask_user tool awaiting user input.
 * Returns the parsed args if so, null otherwise.
 */
function checkAskUserAwaiting(invocation: ToolInvocation): AskUserArgs | null {
  if (invocation.toolName !== "ask_user" || invocation.state !== "result") return null;
  let parsedResult = invocation.result;
  if (typeof parsedResult === "string") {
    try {
      parsedResult = JSON.parse(parsedResult);
    } catch {
      return null;
    }
  }
  if (
    parsedResult !== null &&
    typeof parsedResult === "object" &&
    "status" in parsedResult &&
    (parsedResult as { status: string }).status === "awaiting_user_input"
  ) {
    return parsedResult as unknown as AskUserArgs;
  }
  return null;
}

export function useChatRuntime({
  threadId,
  onTitleGenerated,
  initialMessage,
  onInitialMessageConsumed,
}: UseChatRuntimeOptions) {
  const { messages, saveMessage, deleteMessage, deleteMessagesFrom, refresh } = usePersistence(threadId);
  const abortRef = useRef<boolean>(false);
  const activeThreadIdRef = useRef<string | null>(null);

  const storeRef = useRef<ReturnType<typeof createStreamingStore> | null>(null);
  storeRef.current ??= createStreamingStore();
  const store = storeRef.current;

  // Reset streaming state when thread changes
  useEffect(() => {
    if (activeThreadIdRef.current !== threadId) {
      abortRef.current = true;
      store.setState({ isRunning: false, isStreaming: false, content: "", toolInvocations: [], contentParts: [], pendingAskUser: null, pendingUserMessage: null });
      activeThreadIdRef.current = threadId;
    }
  }, [threadId, store]);

  const streamingState = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState
  );

  const FORM_SUBMISSION_PREFIX = "[Form submission]:";
  const threadMessages: ThreadMessageLike[] = messages
    .filter((m) => !m.content.startsWith(FORM_SUBMISSION_PREFIX))
    .map((m) => convertToThreadMessage(m));

  if (streamingState.pendingUserMessage !== null) {
    threadMessages.push({
      id: "pending-user",
      role: "user",
      content: streamingState.pendingUserMessage,
      createdAt: new Date(),
    });
  }

  // =========================================================================
  // runStreamLoop — the single function that drives the frontend tool loop
  // =========================================================================
  // Streams one request, checks hasToolCalls, loops if needed.
  // Returns the final StreamResult (of the last iteration).
  // Sets pendingAskUser and stops if ask_user is encountered.
  const runStreamLoop = useCallback(
    async (
      chatHistory: ChatMessage[],
      requestThreadId: string,
      /** Content from prior iterations to preserve in userMessageContent for ask_user */
      userMessageContent: string,
      isFirstMessage: boolean,
    ): Promise<StreamResult | null> => {
      let history = chatHistory;
      let lastResult: StreamResult | null = null;
      // Accumulate across all iterations for the final save
      let allText = "";
      let allToolInvocations: ToolInvocation[] = [];

      for (let iteration = 0; ; iteration++) {
        // Check abort / thread switch — return partial results instead of null
        if (abortRef.current || activeThreadIdRef.current !== requestThreadId) {
          if (allText.length > 0 || allToolInvocations.length > 0) {
            return { text: allText, toolInvocations: allToolInvocations, hasToolCalls: false, aborted: true };
          }
          return null;
        }

        // Reset per-iteration streaming UI (keep accumulated content from prior iterations)
        if (iteration > 0) {
          // New iteration: keep existing contentParts visible, just reset per-iteration text accumulator
          store.setState({ isStreaming: true });
        }

        let iterationText = "";
        let pendingAskUserData: PendingAskUser | null = null;

        const result = await streamChatResponse(
          history,
          (chunk) => {
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              iterationText += chunk;
              allText += chunk;
              const parts = [...store.getState().contentParts];
              const lastPart = parts[parts.length - 1];
              if (lastPart?.type === "text") {
                parts[parts.length - 1] = { type: "text", text: lastPart.text + chunk };
              } else {
                parts.push({ type: "text", text: chunk });
              }
              store.setState({ content: allText, contentParts: parts });
            }
          },
          (invocation) => {
            if (!abortRef.current && activeThreadIdRef.current === requestThreadId) {
              // Update tool invocations list
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

              // Update content parts
              const parts = [...store.getState().contentParts];
              const toolPartIndex = parts.findIndex(
                (p) => p.type === "tool" && p.invocation.toolCallId === invocation.toolCallId
              );
              if (toolPartIndex >= 0) {
                parts[toolPartIndex] = { type: "tool", invocation };
              } else {
                parts.push({ type: "tool", invocation });
              }
              store.setState({ contentParts: parts });

              // Track all tool invocations across iterations
              if (invocation.state === "result") {
                const existingAll = allToolInvocations.findIndex(
                  (i) => i.toolCallId === invocation.toolCallId
                );
                if (existingAll >= 0) {
                  allToolInvocations[existingAll] = invocation;
                } else {
                  allToolInvocations = [...allToolInvocations, invocation];
                }
              }

              // Check for ask_user
              const askUserArgs = checkAskUserAwaiting(invocation);
              if (askUserArgs !== null) {
                const currentState = store.getState();
                pendingAskUserData = {
                  toolCallId: invocation.toolCallId,
                  args: askUserArgs,
                  userMessageContent,
                  assistantContent: currentState.content,
                  assistantToolInvocations: currentState.toolInvocations,
                  isFirstMessage,
                  chatHistorySnapshot: history,
                };
                store.setState({ pendingAskUser: pendingAskUserData });
              }
            }
          },
          true,
          requestThreadId,
        );

        lastResult = result;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
        if (abortRef.current || activeThreadIdRef.current !== requestThreadId) {
          if (allText.length > 0 || allToolInvocations.length > 0) {
            return { text: allText, toolInvocations: allToolInvocations, hasToolCalls: false, aborted: true };
          }
          return null;
        }

        // If ask_user is pending, stop the loop
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pendingAskUserData is mutated in callback
        if (pendingAskUserData !== null) {
          return null; // Caller should not save — ask_user handler will
        }

        // If no tool calls, we're done
        if (!result.hasToolCalls) {
          break;
        }

        // Has tool calls and no ask_user — append assistant + tool results to history and loop
        history = [
          ...history,
          {
            role: "assistant" as const,
            content: iterationText,
            toolInvocations: result.toolInvocations,
          },
          {
            role: "user" as const,
            content: "",
            toolResults: result.toolInvocations.map((inv) => ({
              toolCallId: inv.toolCallId,
              result: inv.result,
            })),
          },
        ];

        console.log(`[runStreamLoop] Iteration ${String(iteration + 1)} complete, looping for tool continuation`);
      }

      // Return combined result — lastResult is always set after at least one iteration
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- loop may break before assignment on abort
      if (lastResult !== null) {
        return {
          text: allText,
          toolInvocations: allToolInvocations,
          hasToolCalls: lastResult.hasToolCalls,
        };
      }
      return null;
    },
    [store]
  );

  // =========================================================================
  // sendMessageInternal — save user msg → build history → runStreamLoop → save assistant msg
  // =========================================================================
  const sendMessageInternal = useCallback(
    async (textContent: string) => {
      if (threadId === null) return;
      const requestThreadId = threadId;

      const apiKey = await getApiKey();
      if (apiKey === null || apiKey === "") {
        await saveMessage({
          role: "assistant",
          content: "Please set your Anthropic API key in settings (gear icon) to use AI features.",
        });
        await refresh();
        return;
      }

      if (textContent.length === 0) return;

      store.setState({
        isRunning: true,
        isStreaming: false,
        content: "",
        toolInvocations: [],
        contentParts: [],
        pendingUserMessage: textContent,
      });
      abortRef.current = false;

      try {
        if (activeThreadIdRef.current !== requestThreadId) {
          abortRef.current = true;
          return;
        }

        const isFirstMessage = messages.length === 0;

        // Save user message first
        await saveMessage({ role: "user", content: textContent });
        await refresh();
        store.setState({ pendingUserMessage: null });

        // Build chat history
        const chatHistory: ChatMessage[] = messages.map((m) => {
          const msg: ChatMessage = { role: m.role, content: m.content };
          if (m.toolInvocations !== undefined && m.toolInvocations.length > 0) {
            msg.toolInvocations = m.toolInvocations;
          }
          return msg;
        });
        chatHistory.push({ role: "user", content: textContent });

        store.setState({ isStreaming: true });

        const result = await runStreamLoop(chatHistory, requestThreadId, textContent, isFirstMessage);

        store.setState({ isStreaming: false });

        // If runStreamLoop returned null, ask_user is pending or truly empty — don't save
        if (result === null) return;

        // If aborted but has partial content, still save it
        const wasAborted = activeThreadIdRef.current !== requestThreadId || abortRef.current;

        // Clear streaming UI before saving/refreshing to prevent duplicate display
        store.setState({ content: "", contentParts: [], toolInvocations: [], pendingUserMessage: null });

        // Save assistant response
        const assistantMessage: { role: "assistant"; content: string; toolInvocations?: ToolInvocation[] } = {
          role: "assistant",
          content: result.text,
        };
        if (result.toolInvocations.length > 0) {
          assistantMessage.toolInvocations = result.toolInvocations;
        }
        await saveMessage(assistantMessage);

        // Generate title after first exchange (skip if aborted)
        if (isFirstMessage && onTitleGenerated !== undefined && !wasAborted) {
          try {
            const title = await generateConversationTitle(textContent, result.text);
            onTitleGenerated(title);
          } catch {
            const fallbackTitle = textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "");
            onTitleGenerated(fallbackTitle);
          }
        }

        await refresh();
      } catch (error) {
        if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
          store.setState({ isStreaming: false, content: "", toolInvocations: [], contentParts: [], pendingUserMessage: null });
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          await saveMessage({ role: "assistant", content: `Error: ${errorMessage}` });
          await refresh();
        }
      } finally {
        if (activeThreadIdRef.current === requestThreadId) {
          store.setState({ isRunning: false });
        }
      }
    },
    [threadId, messages, saveMessage, refresh, onTitleGenerated, store, runStreamLoop]
  );

  const sendMessage = useCallback(
    (textContent: string) => sendMessageInternal(textContent),
    [sendMessageInternal]
  );

  // =========================================================================
  // continueFromAskUser — append tool result to snapshot → runStreamLoop → save
  // =========================================================================
  const continueFromAskUser = useCallback(
    async (pending: PendingAskUser, response: unknown) => {
      if (threadId === null) return;
      const requestThreadId = threadId;

      const apiKey = await getApiKey();
      if (apiKey === null || apiKey === "") {
        await saveMessage({
          role: "assistant",
          content: "Please set your Anthropic API key in settings to use AI features.",
        });
        await refresh();
        return;
      }

      store.setState({ isRunning: true, isStreaming: true, content: "", toolInvocations: [], contentParts: [] });
      abortRef.current = false;

      try {
        const chatHistory: ChatMessage[] = [
          ...pending.chatHistorySnapshot,
          {
            role: "assistant" as const,
            content: pending.assistantContent,
            toolInvocations: pending.assistantToolInvocations,
          },
          {
            role: "user" as const,
            content: "",
            toolResults: [{ toolCallId: pending.toolCallId, result: response }],
          },
        ];

        const result = await runStreamLoop(chatHistory, requestThreadId, "", false);

        store.setState({ isStreaming: false });

        if (result === null) return; // ask_user pending or truly empty

        // Clear streaming UI before saving/refreshing to prevent duplicate display
        store.setState({ content: "", contentParts: [], toolInvocations: [] });

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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
        if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
          store.setState({ isStreaming: false, content: "", toolInvocations: [], contentParts: [] });
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          await saveMessage({ role: "assistant", content: `Error: ${errorMessage}` });
          await refresh();
        }
      } finally {
        if (activeThreadIdRef.current === requestThreadId) {
          store.setState({ isRunning: false });
        }
      }
    },
    [threadId, store, saveMessage, refresh, runStreamLoop]
  );

  // =========================================================================
  // handleAskUserSubmit / handleAskUserCancel
  // =========================================================================
  const handleAskUserSubmit = useCallback(
    async (response: unknown) => {
      const pending = store.getState().pendingAskUser;
      if (pending === null) return;

      store.setState({ pendingAskUser: null });

      if (pending.userMessageContent.length > 0) {
        await saveMessage({ role: "user", content: pending.userMessageContent });
      }

      const updatedToolInvocations = pending.assistantToolInvocations.map((inv) =>
        inv.toolCallId === pending.toolCallId ? { ...inv, result: response } : inv
      );

      await saveMessage({
        role: "assistant",
        content: pending.assistantContent,
        toolInvocations: updatedToolInvocations,
      });

      if (pending.isFirstMessage && onTitleGenerated !== undefined) {
        try {
          const title = await generateConversationTitle(pending.userMessageContent, pending.assistantContent);
          onTitleGenerated(title);
        } catch {
          const fallbackTitle = pending.userMessageContent.slice(0, 50) + (pending.userMessageContent.length > 50 ? "..." : "");
          onTitleGenerated(fallbackTitle);
        }
      }

      await refresh();
      void continueFromAskUser(pending, response);
    },
    [store, saveMessage, refresh, onTitleGenerated, continueFromAskUser]
  );

  const handleAskUserCancel = useCallback(async () => {
    const pending = store.getState().pendingAskUser;
    if (pending === null) return;

    store.setState({ pendingAskUser: null });

    if (pending.userMessageContent.length > 0) {
      await saveMessage({ role: "user", content: pending.userMessageContent });
    }

    const updatedToolInvocations = pending.assistantToolInvocations.map((inv) =>
      inv.toolCallId === pending.toolCallId ? { ...inv, result: { cancelled: true } } : inv
    );

    await saveMessage({
      role: "assistant",
      content: pending.assistantContent,
      toolInvocations: updatedToolInvocations,
    });

    await refresh();
    void continueFromAskUser(pending, { cancelled: true });
  }, [store, saveMessage, refresh, continueFromAskUser]);

  // =========================================================================
  // regenerateLastMessage — delete last assistant → build history → runStreamLoop → save
  // =========================================================================
  const regenerateLastMessage = useCallback(async () => {
    if (threadId === null || streamingState.isRunning) return;

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

    let userMessageBefore: Message | undefined;
    for (let i = lastAssistantIndex - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "user") {
        userMessageBefore = msg;
        break;
      }
    }
    if (userMessageBefore === undefined) return;

    const lastAssistantId = lastAssistant.id;
    await deleteMessage(lastAssistantId);
    await refresh();

    store.setState({
      isRunning: true,
      isStreaming: false,
      content: "",
      toolInvocations: [],
      contentParts: [],
      pendingUserMessage: null,
    });
    abortRef.current = false;

    const requestThreadId = threadId;

    try {
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

      const result = await runStreamLoop(chatHistory, requestThreadId, "", false);

      store.setState({ isStreaming: false });

      if (result === null) return;

      // Clear streaming UI before saving/refreshing to prevent duplicate display
      store.setState({ content: "", contentParts: [], toolInvocations: [] });

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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
      if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
        store.setState({ isStreaming: false, content: "", toolInvocations: [], contentParts: [] });
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        await saveMessage({ role: "assistant", content: `Error: ${errorMessage}` });
        await refresh();
      }
    } finally {
      if (activeThreadIdRef.current === requestThreadId) {
        store.setState({ isRunning: false });
      }
    }
  }, [threadId, messages, deleteMessage, refresh, saveMessage, store, streamingState.isRunning, runStreamLoop]);

  // =========================================================================
  // regenerateMessage — delete this assistant message + everything after → re-run
  // =========================================================================
  const regenerateMessage = useCallback(async (messageId: string) => {
    if (threadId === null || streamingState.isRunning) return;

    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;
    const targetMsg = messages[msgIndex];
    if (targetMsg?.role !== "assistant") return;

    // Delete this message and everything after it
    await deleteMessagesFrom(messageId);
    await refresh();

    // Build history from messages before this one
    const historyMessages = messages.slice(0, msgIndex);

    store.setState({
      isRunning: true,
      isStreaming: false,
      content: "",
      toolInvocations: [],
      contentParts: [],
      pendingUserMessage: null,
    });
    abortRef.current = false;

    const requestThreadId = threadId;

    try {
      const chatHistory: ChatMessage[] = historyMessages.map((m) => {
        const msg: ChatMessage = { role: m.role, content: m.content };
        if (m.toolInvocations !== undefined && m.toolInvocations.length > 0) {
          msg.toolInvocations = m.toolInvocations;
        }
        return msg;
      });

      store.setState({ isStreaming: true });

      const result = await runStreamLoop(chatHistory, requestThreadId, "", false);

      store.setState({ isStreaming: false });

      if (result === null) return;

      store.setState({ content: "", contentParts: [], toolInvocations: [] });

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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
      if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
        store.setState({ isStreaming: false, content: "", toolInvocations: [], contentParts: [] });
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        await saveMessage({ role: "assistant", content: `Error: ${errorMessage}` });
        await refresh();
      }
    } finally {
      if (activeThreadIdRef.current === requestThreadId) {
        store.setState({ isRunning: false });
      }
    }
  }, [threadId, messages, deleteMessagesFrom, refresh, saveMessage, store, streamingState.isRunning, runStreamLoop]);

  // =========================================================================
  // editUserMessage — delete from this user msg onward → send new content
  // =========================================================================
  const editUserMessage = useCallback(async (messageId: string, newContent: string) => {
    if (threadId === null || streamingState.isRunning) return;
    if (newContent.trim().length === 0) return;

    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;
    const targetMsg = messages[msgIndex];
    if (targetMsg?.role !== "user") return;

    // Delete this message and everything after it
    await deleteMessagesFrom(messageId);
    await refresh();

    // Build history from messages before this one, then add the edited message
    const historyMessages = messages.slice(0, msgIndex);

    store.setState({
      isRunning: true,
      isStreaming: false,
      content: "",
      toolInvocations: [],
      contentParts: [],
      pendingUserMessage: newContent,
    });
    abortRef.current = false;

    const requestThreadId = threadId;

    try {
      // Save the edited user message
      await saveMessage({ role: "user", content: newContent });
      await refresh();
      store.setState({ pendingUserMessage: null });

      const chatHistory: ChatMessage[] = historyMessages.map((m) => {
        const msg: ChatMessage = { role: m.role, content: m.content };
        if (m.toolInvocations !== undefined && m.toolInvocations.length > 0) {
          msg.toolInvocations = m.toolInvocations;
        }
        return msg;
      });
      chatHistory.push({ role: "user", content: newContent });

      store.setState({ isStreaming: true });

      const result = await runStreamLoop(chatHistory, requestThreadId, newContent, false);

      store.setState({ isStreaming: false });

      if (result === null) return;

      const wasAborted = activeThreadIdRef.current !== requestThreadId || abortRef.current;

      store.setState({ content: "", contentParts: [], toolInvocations: [], pendingUserMessage: null });

      const assistantMessage: { role: "assistant"; content: string; toolInvocations?: ToolInvocation[] } = {
        role: "assistant",
        content: result.text,
      };
      if (result.toolInvocations.length > 0) {
        assistantMessage.toolInvocations = result.toolInvocations;
      }
      await saveMessage(assistantMessage);

      if (onTitleGenerated !== undefined && !wasAborted && historyMessages.length === 0) {
        try {
          const title = await generateConversationTitle(newContent, result.text);
          onTitleGenerated(title);
        } catch {
          onTitleGenerated(newContent.slice(0, 50));
        }
      }

      await refresh();
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can be mutated asynchronously
      if (activeThreadIdRef.current === requestThreadId && !abortRef.current) {
        store.setState({ isStreaming: false, content: "", toolInvocations: [], contentParts: [], pendingUserMessage: null });
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        await saveMessage({ role: "assistant", content: `Error: ${errorMessage}` });
        await refresh();
      }
    } finally {
      if (activeThreadIdRef.current === requestThreadId) {
        store.setState({ isRunning: false });
      }
    }
  }, [threadId, messages, deleteMessagesFrom, refresh, saveMessage, store, streamingState.isRunning, runStreamLoop, onTitleGenerated]);

  // =========================================================================
  // Wiring
  // =========================================================================
  const onNew = useCallback(
    async (message: AppendMessage) => {
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
    store.setState({ isRunning: false, isStreaming: false, content: "", toolInvocations: [], contentParts: [], pendingAskUser: null, pendingUserMessage: null });
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

  const runtime = useExternalStoreRuntime({
    isRunning: streamingState.isRunning,
    messages: threadMessages,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
    onCancel,
  });

  return {
    runtime,
    isRunning: streamingState.isRunning,
    streamingContentParts: streamingState.contentParts,
    streamingContent: streamingState.content,
    pendingAskUser: streamingState.pendingAskUser,
    handleAskUserSubmit,
    handleAskUserCancel,
    regenerateLastMessage,
    regenerateMessage,
    editUserMessage,
  };
}
