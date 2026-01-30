import { useState, useEffect, useRef, useCallback, createContext, useContext, Component, type ReactNode, type ErrorInfo } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useThreadRuntime,
  useMessage,
} from "@assistant-ui/react";
import { ArrowUp, Square, Sparkles, MessageCircle, RotateCcw, Pencil, Check, X, AlertTriangle } from "lucide-react";
import type { Thread } from "@app/types/thread";
import { useChatRuntime } from "@app/hooks/useChatRuntime";
import { Markdown } from "./Markdown";
import { ToolDisplay } from "./ToolDisplay";
import { AskUserQuestion, type AskUserQuestionArgs } from "./AskUserQuestion";
import type { ToolInvocation } from "@app/types/message";
import type { StreamingContentPart } from "@app/hooks/useChatRuntime";

// Error boundary to prevent individual message/tool render errors from blanking the screen
interface MessageErrorBoundaryProps {
  children: ReactNode;
}
interface MessageErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}
class MessageErrorBoundary extends Component<MessageErrorBoundaryProps, MessageErrorBoundaryState> {
  constructor(props: MessageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): MessageErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[MessageErrorBoundary] Render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-hover)", color: "var(--fg-muted)" }}>
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--warning, var(--fg-muted))" }} />
          <span>Failed to render message</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// Store scroll positions per thread (persists across re-renders)
const scrollPositions = new Map<string, number>();

interface ChatThreadProps {
  threadId: string | null;
  onTitleGenerated?: ((title: string) => void) | undefined;
  onStartChatWithMessage?: ((message: string) => void) | undefined;
  onSelectThread?: ((id: string) => void) | undefined;
  recentThreads?: Thread[] | undefined;
  initialMessage?: string | null | undefined;
  onInitialMessageConsumed?: (() => void) | undefined;
}

function WelcomeScreen({ onStartChatWithMessage, onSelectThread, recentThreads }: {
  onStartChatWithMessage?: ((message: string) => void) | undefined;
  onSelectThread?: ((id: string) => void) | undefined;
  recentThreads?: Thread[] | undefined;
}) {
  const threads = recentThreads ?? [];
  const [time, setTime] = useState(new Date());
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => { clearInterval(timer); };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  };

  const displayThreads = threads.slice(0, 4);

  return (
    <div className="flex h-full flex-col items-center justify-center px-4" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-lg text-center">
        {/* Large Clock */}
        <div className="mb-2 font-light tracking-tight" style={{ fontSize: "6rem", color: "var(--fg-primary)" }}>
          {formatTime(time)}
        </div>

        {/* Date */}
        <p className="mb-12 text-lg" style={{ color: "var(--fg-secondary)" }}>
          {formatDate(time)}
        </p>

        {/* Input */}
        <div className="mb-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputValue.trim().length > 0) {
                onStartChatWithMessage?.(inputValue.trim());
              }
            }}
            className="flex w-full items-center rounded-2xl border transition-colors"
            style={{ borderColor: "var(--border-secondary)", background: "var(--bg-tertiary)" }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); }}
              placeholder="Start a new conversation..."
              className="flex-1 bg-transparent px-4 py-4 focus:outline-none"
              style={{ color: "var(--fg-primary)" }}
              autoFocus
            />
            <button
              type="submit"
              disabled={inputValue.trim().length === 0}
              className="m-2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "var(--bg-hover)", color: "var(--fg-secondary)" }}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Recent Conversations */}
        {displayThreads.length > 0 && (
          <div className="text-left">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
              Recent conversations
            </p>
            <div className="space-y-1">
              {displayThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => { onSelectThread?.(thread.id); }}
                  className="recent-chat-item flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                  style={{ color: "var(--fg-muted)" }}
                >
                  <MessageCircle className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="truncate">{thread.title ?? "New conversation"}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Context for pending ask_user question, regenerate, edit, running state, and live streaming
interface ChatContext {
  pendingAskUser: { toolCallId: string; args: AskUserQuestionArgs } | null;
  onAskUserSubmit: (response: unknown) => void | Promise<void>;
  onAskUserCancel: () => void | Promise<void>;
  onRegenerate: () => void | Promise<void>;
  onRegenerateMessage: (messageId: string) => void | Promise<void>;
  onEditUserMessage: (messageId: string, newContent: string) => void | Promise<void>;
  isRunning: boolean;
  streamingContentParts: StreamingContentPart[];
  streamingContent: string;
}
const ChatContextProvider = createContext<ChatContext | null>(null);
function useChatContext() {
  return useContext(ChatContextProvider);
}

export function ChatThread({ threadId, onTitleGenerated, onStartChatWithMessage, onSelectThread, recentThreads, initialMessage, onInitialMessageConsumed }: ChatThreadProps) {
  const { runtime, isRunning, streamingContentParts, streamingContent, pendingAskUser, handleAskUserSubmit, handleAskUserCancel, regenerateLastMessage, regenerateMessage, editUserMessage } = useChatRuntime({ threadId, onTitleGenerated, initialMessage, onInitialMessageConsumed });
  const prevThreadIdRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Save scroll position when switching away from a thread
  useEffect(() => {
    const prevThreadId = prevThreadIdRef.current;
    if (prevThreadId !== null && prevThreadId !== threadId && scrollContainerRef.current !== null) {
      scrollPositions.set(prevThreadId, scrollContainerRef.current.scrollTop);
    }
    prevThreadIdRef.current = threadId;
  }, [threadId]);

  // Callback to set the scroll container ref
  const setScrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el;
    // Restore scroll position when switching to a thread
    if (el !== null && threadId !== null) {
      const savedPosition = scrollPositions.get(threadId);
      if (savedPosition !== undefined) {
        el.scrollTop = savedPosition;
      }
    }
  }, [threadId]);

  if (threadId === null) {
    return (
      <WelcomeScreen
        onStartChatWithMessage={onStartChatWithMessage}
        onSelectThread={onSelectThread}
        recentThreads={recentThreads}
      />
    );
  }

  const chatContextValue: ChatContext = {
    pendingAskUser,
    onAskUserSubmit: handleAskUserSubmit,
    onAskUserCancel: handleAskUserCancel,
    onRegenerate: regenerateLastMessage,
    onRegenerateMessage: regenerateMessage,
    onEditUserMessage: editUserMessage,
    isRunning,
    streamingContentParts,
    streamingContent,
  };

  return (
    <ChatContextProvider.Provider value={chatContextValue}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadContent scrollRef={setScrollRef} />
      </AssistantRuntimeProvider>
    </ChatContextProvider.Provider>
  );
}

interface ThreadContentProps {
  scrollRef: (el: HTMLDivElement | null) => void;
}

function ThreadContent({ scrollRef }: ThreadContentProps) {
  const runtime = useThreadRuntime();
  const chatContext = useChatContext();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  // Combined ref callback
  const setScrollContainerRef = useCallback((el: HTMLDivElement | null) => {
    scrollContainerRef.current = el;
    scrollRef(el);
  }, [scrollRef]);

  // Track if user is near bottom (for auto-scroll)
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container === null) return;
    const threshold = 100; // pixels from bottom
    isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Auto-scroll when streaming (if user is near bottom)
  useEffect(() => {
    const state = runtime.getState();
    if (!state.isRunning) return;

    const scrollToBottom = () => {
      const container = scrollContainerRef.current;
      if (container !== null && isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    };

    // Scroll immediately and set up interval for streaming
    scrollToBottom();
    const interval = setInterval(scrollToBottom, 100);
    return () => { clearInterval(interval); };
  }, [runtime]);

  // Subscribe to runtime state changes for streaming
  useEffect(() => {
    const unsubscribe = runtime.subscribe(() => {
      const state = runtime.getState();
      if (state.isRunning && isNearBottomRef.current) {
        const container = scrollContainerRef.current;
        if (container !== null) {
          container.scrollTop = container.scrollHeight;
        }
      }
    });
    return unsubscribe;
  }, [runtime]);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-primary)" }}>
      <ThreadPrimitive.Root
        className="flex-1 overflow-y-auto"
        ref={setScrollContainerRef}
        onScroll={handleScroll}
      >
        <ThreadPrimitive.Viewport className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
          <ThreadPrimitive.Empty>
            <div className="flex h-full flex-col items-center justify-center py-16">
              <div
                className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ background: "var(--bg-tertiary)" }}
              >
                <Sparkles className="h-6 w-6" style={{ color: "var(--fg-muted)" }} />
              </div>
              <h3 className="mb-2 text-lg font-medium" style={{ color: "var(--fg-primary)" }}>
                How can I help you today?
              </h3>
              <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                Type a message below to get started
              </p>
            </div>
          </ThreadPrimitive.Empty>
          {/* Show current time when there are messages */}
          <ThreadPrimitive.If empty={false}>
            <CurrentTimeHeader />
          </ThreadPrimitive.If>
          <ThreadPrimitive.Messages
            components={{
              UserMessage: () => <MessageErrorBoundary><UserMessage /></MessageErrorBoundary>,
              AssistantMessage: AssistantMessage,
            }}
          />
          <StreamingMessage />
          <ChatRunningIndicator />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      <div
        className="border-t p-4 backdrop-blur"
        style={{ borderColor: "var(--border-primary)", background: "var(--bg-primary)" }}
      >
        <div className="mx-auto max-w-3xl">
          {/* AskUserQuestion inline UI */}
          {chatContext?.pendingAskUser !== null && chatContext?.pendingAskUser !== undefined && (
            <div className="mb-3">
              <AskUserQuestion
                args={chatContext.pendingAskUser.args}
                onSubmit={chatContext.onAskUserSubmit}
                onCancel={chatContext.onAskUserCancel}
              />
            </div>
          )}
          <ComposerPrimitive.Root
            className="aui-composer relative flex items-end rounded-2xl border shadow-lg transition-colors"
            style={{ borderColor: "var(--border-secondary)", background: "var(--bg-tertiary)" }}
          >
            <ComposerPrimitive.Input
              placeholder="Message AIOS..."
              className="aui-composer-input min-h-[52px] flex-1 resize-none bg-transparent px-4 py-3 focus:outline-none"
              style={{ color: "var(--fg-primary)" }}
              autoFocus
            />
            {chatContext?.isRunning === true ? (
              <button
                type="button"
                onClick={() => { runtime.cancelRun(); }}
                className="m-2 flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
                style={{ background: "var(--danger, #ef4444)", color: "white" }}
                title="Stop generating"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <ComposerPrimitive.Send
                className="aui-composer-send m-2 flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors"
                style={{ background: "var(--bg-accent)" }}
              >
                <ArrowUp className="h-4 w-4" />
              </ComposerPrimitive.Send>
            )}
          </ComposerPrimitive.Root>
          <p className="mt-2 text-center text-xs" style={{ color: "var(--fg-muted)" }}>
            AI can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  );
}

function CurrentTimeHeader() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => { setTime(new Date()); }, 1000);
    return () => { clearInterval(timer); };
  }, []);

  return (
    <div className="flex justify-center pb-4">
      <span className="text-sm font-light" style={{ color: "var(--fg-muted)" }}>
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function StreamingMessage() {
  const chatContext = useChatContext();
  if (chatContext?.isRunning !== true) return null;

  const { streamingContentParts } = chatContext;
  const hasContent = streamingContentParts.length > 0;
  if (!hasContent) return null;

  return (
    <div className="group flex justify-start">
      <div className="flex max-w-[85%] gap-3 overflow-hidden">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-md"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Sparkles className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <MessageErrorBoundary>
            <InterleavedContent parts={streamingContentParts} />
          </MessageErrorBoundary>
        </div>
      </div>
    </div>
  );
}

function ChatRunningIndicator() {
  const chatContext = useChatContext();

  if (chatContext?.isRunning !== true) return null;

  // Don't show if streaming content is already visible
  if (chatContext.streamingContentParts.length > 0) return null;

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-md"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Sparkles className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "var(--fg-muted)" }} />
            <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "var(--fg-muted)" }} />
            <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "var(--fg-muted)" }} />
          </div>
          <span className="text-sm" style={{ color: "var(--fg-muted)" }}>Thinking...</span>
        </div>
      </div>
    </div>
  );
}

function UserMessage() {
  const message = useMessage();
  const chatContext = useChatContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const messageId = message.id;
  const textContent = message.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  const handleStartEdit = () => {
    setEditText(textContent);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    if (editText.trim().length > 0 && chatContext?.onEditUserMessage !== undefined) {
      setIsEditing(false);
      void chatContext.onEditUserMessage(messageId, editText.trim());
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <MessagePrimitive.Root className="flex justify-end">
        <div className="flex w-full max-w-[85%] flex-col gap-2">
          <textarea
            value={editText}
            onChange={(e) => { setEditText(e.target.value); }}
            className="w-full resize-none rounded-2xl px-4 py-3 text-sm shadow-md focus:outline-none"
            style={{ background: "var(--bg-hover)", color: "var(--fg-primary)", border: "2px solid var(--fg-accent)" }}
            rows={Math.min(editText.split("\n").length + 1, 8)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleConfirmEdit();
              }
              if (e.key === "Escape") {
                handleCancelEdit();
              }
            }}
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
              style={{ color: "var(--fg-muted)" }}
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmEdit}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
              style={{ color: "var(--fg-accent)" }}
            >
              <Check className="h-3 w-3" />
              Save & Submit
            </button>
          </div>
        </div>
      </MessagePrimitive.Root>
    );
  }

  return (
    <MessagePrimitive.Root className="group flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-1">
        <div
          className="rounded-2xl px-4 py-3 shadow-md"
          style={{ background: "var(--bg-hover)", color: "var(--fg-primary)" }}
        >
          <MessagePrimitive.Content
            components={{
              Text: ({ text }) => <Markdown content={text} />,
            }}
          />
        </div>
        {chatContext?.isRunning !== true && (
          <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={handleStartEdit}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
              style={{ color: "var(--fg-muted)" }}
              title="Edit message"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          </div>
        )}
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const message = useMessage();
  const chatContext = useChatContext();

  // Check if message has actual text content
  const hasTextContent = message.content.some(
    (part) => part.type === "text" && part.text.trim().length > 0
  );

  // Check if message has tool invocations
  const custom = message.metadata.custom as { toolInvocations?: ToolInvocation[] } | undefined;
  const hasToolInvocations = (custom?.toolInvocations?.length ?? 0) > 0;

  // Don't render anything if there's no content and no tools
  if (!hasTextContent && !hasToolInvocations) {
    return null;
  }

  const canRegenerate = chatContext?.isRunning !== true && chatContext?.onRegenerateMessage !== undefined;

  return (
    <MessagePrimitive.Root className="group flex justify-start">
      <div className="flex max-w-[85%] gap-3 overflow-hidden">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-md"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Sparkles className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <MessageErrorBoundary>
            {hasTextContent && (
              <div
                className="rounded-2xl px-4 py-3 shadow-md"
                style={{ background: "var(--bg-tertiary)", color: "var(--fg-primary)" }}
              >
                <MessagePrimitive.Content
                  components={{
                    Text: ({ text }) => <Markdown content={text} />,
                  }}
                />
              </div>
            )}
            <ToolInvocationsRenderer />
          </MessageErrorBoundary>
          {canRegenerate && (
            <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => { void chatContext.onRegenerateMessage(message.id); }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors"
                style={{ color: "var(--fg-muted)" }}
                title="Regenerate from here"
              >
                <RotateCcw className="h-3 w-3" />
                Regenerate
              </button>
            </div>
          )}
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function InterleavedContent({ parts }: { parts: StreamingContentPart[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") {
          if (part.text.trim().length === 0) return null;
          return (
            <div
              key={`text-${String(i)}`}
              className="rounded-2xl px-4 py-3 shadow-md"
              style={{ background: "var(--bg-tertiary)", color: "var(--fg-primary)" }}
            >
              <Markdown content={part.text} />
            </div>
          );
        }
        return (
          <ToolDisplay key={part.invocation.toolCallId} toolInvocation={part.invocation} />
        );
      })}
    </>
  );
}

function ToolInvocationsRenderer() {
  const message = useMessage();

  // Get tool invocations from the current message's metadata
  const custom = message.metadata.custom as { toolInvocations?: ToolInvocation[] } | undefined;
  const toolInvocations = custom?.toolInvocations;

  if (toolInvocations === undefined || toolInvocations.length === 0) return null;

  return (
    <>
      {toolInvocations.map((invocation) => (
        <ToolDisplay key={invocation.toolCallId} toolInvocation={invocation} />
      ))}
    </>
  );
}
