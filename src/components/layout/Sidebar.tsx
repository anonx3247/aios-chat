import { MessageSquarePlus, Trash2, MessageCircle, ChevronLeft, Settings } from "lucide-react";
import type { Thread } from "@app/types/thread";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  isLoading: boolean;
  isCollapsed: boolean;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onToggleCollapse: () => void;
  onMouseLeave?: (() => void) | undefined;
  onOpenSettings: () => void;
}

export function Sidebar({
  threads,
  activeThreadId,
  isLoading,
  isCollapsed,
  onNewChat,
  onSelectThread,
  onDeleteThread,
  onToggleCollapse,
  onMouseLeave,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside
      className={`flex h-full flex-col border-r transition-all duration-300 ${
        isCollapsed ? "w-0 overflow-hidden border-r-0" : "w-72"
      }`}
      style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-center justify-between p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-md transition-all"
          style={{ background: "var(--bg-tertiary)", color: "var(--fg-primary)" }}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-2 rounded-lg p-2 transition-colors"
          style={{ color: "var(--fg-muted)" }}
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
              <div
                className="h-4 w-4 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--border-secondary)", borderTopColor: "var(--fg-muted)" }}
              />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="mb-3 h-12 w-12" style={{ color: "var(--border-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--fg-muted)" }}>No conversations yet</p>
            <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
              Start a new chat to begin
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
              Recent Chats
            </p>
            {threads.map((thread) => (
              <ThreadListItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                onSelect={() => { onSelectThread(thread.id); }}
                onDelete={() => { onDeleteThread(thread.id); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Settings at bottom */}
      <div className="border-t p-3" style={{ borderColor: "var(--border-primary)" }}>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
          style={{ color: "var(--fg-muted)" }}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

interface ThreadListItemProps {
  thread: Thread;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function ThreadListItem({
  thread,
  isActive,
  onSelect,
  onDelete,
}: ThreadListItemProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
      className="group flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all"
      style={{
        background: isActive ? "var(--bg-tertiary)" : "transparent",
        color: isActive ? "var(--fg-primary)" : "var(--fg-muted)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MessageCircle className="h-4 w-4 shrink-0 opacity-50" />
        <span className="truncate">
          {thread.title ?? "New conversation"}
        </span>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className="ml-2 shrink-0 rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100"
        style={{ color: "var(--fg-muted)" }}
        title="Delete conversation"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
