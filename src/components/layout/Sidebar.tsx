import { MessageSquarePlus, Trash2 } from "lucide-react";
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
    <aside className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-zinc-500">Loading...</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-zinc-500">No conversations yet</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {threads.map((thread) => (
              <ThreadListItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                onSelect={() => { onSelectThread(thread.id); }}
                onDelete={() => { onDeleteThread(thread.id); }}
              />
            ))}
          </ul>
        )}
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
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
          isActive
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100"
        }`}
      >
        <span className="truncate">
          {thread.title ?? "New conversation"}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="ml-2 rounded p-1 text-zinc-500 opacity-0 hover:bg-zinc-700 hover:text-red-400 group-hover:opacity-100"
          title="Delete conversation"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </button>
    </li>
  );
}
