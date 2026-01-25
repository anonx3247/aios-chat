import { useCallback, useState } from "react";
import { Settings, Sparkles } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SettingsModal } from "./SettingsModal";
import { ChatThread } from "@app/components/chat/ChatThread";
import { useThreads } from "@app/hooks/useThreads";

export function MainLayout() {
  const {
    threads,
    isLoading,
    createThread,
    deleteThread,
    updateThreadTitle,
  } = useThreads();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleNewChat = useCallback(async () => {
    const thread = await createThread();
    setActiveThreadId(thread.id);
  }, [createThread]);

  const handleSelectThread = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      await deleteThread(id);
      if (activeThreadId === id) {
        setActiveThreadId(null);
      }
    },
    [deleteThread, activeThreadId]
  );

  const handleTitleGenerated = useCallback(
    (title: string) => {
      if (activeThreadId !== null) {
        void updateThreadTitle(activeThreadId, title);
      }
    },
    [activeThreadId, updateThreadTitle]
  );

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100">
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        isLoading={isLoading}
        onNewChat={() => void handleNewChat()}
        onSelectThread={handleSelectThread}
        onDeleteThread={(id) => void handleDeleteThread(id)}
      />
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-lg font-semibold">AIOS Chat</h1>
          </div>
          <button
            type="button"
            onClick={() => { setIsSettingsOpen(true); }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </header>
        <div className="flex-1 overflow-hidden">
          <ChatThread
            threadId={activeThreadId}
            onTitleGenerated={handleTitleGenerated}
          />
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => { setIsSettingsOpen(false); }}
      />
    </div>
  );
}
