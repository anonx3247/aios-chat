import { MessageSquarePlus, Trash2, MessageCircle } from "lucide-react";
import type { Thread } from "@app/types/thread";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  isLoading: boolean;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
}

export function Sidebar({
  threads,
  activeThreadId,
  isLoading,
  onNewChat,
  onSelectThread,
  onDeleteThread,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-72 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-medium text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/25"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-400" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle className="mb-3 h-12 w-12 text-zinc-700" />
            <p className="text-sm text-zinc-500">No conversations yet</p>
            <p className="mt-1 text-xs text-zinc-600">
              Start a new chat to begin
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-zinc-600">
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

      <div className="border-t border-zinc-800 p-4">
        <p className="text-center text-xs text-zinc-600">
          Powered by Claude
        </p>
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
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
        isActive
          ? "bg-zinc-800 text-zinc-100 shadow-md"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
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
        className="ml-2 shrink-0 rounded-lg p-1.5 text-zinc-500 opacity-0 transition-all hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100"
        title="Delete conversation"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </button>
  );
}
