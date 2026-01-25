import { useCallback, useState } from "react";
import { Sidebar } from "./Sidebar";
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
        <header className="border-b border-zinc-800 px-6 py-4">
          <h1 className="text-lg font-semibold">AIOS Chat</h1>
        </header>
        <div className="flex-1">
          <ChatThread
            threadId={activeThreadId}
            onTitleGenerated={handleTitleGenerated}
          />
        </div>
      </main>
    </div>
  );
}
