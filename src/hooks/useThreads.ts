import { useCallback, useEffect, useState } from "react";
import type { Thread } from "@app/types/thread";
import * as tauri from "@app/lib/tauri";

interface UseThreadsResult {
  threads: Thread[];
  isLoading: boolean;
  error: string | null;
  createThread: () => Promise<Thread>;
  deleteThread: (id: string) => Promise<void>;
  updateThreadTitle: (id: string, title: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useThreads(): UseThreadsResult {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await tauri.listThreads();
      setThreads(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createThread = useCallback(async () => {
    const thread = await tauri.createThread();
    setThreads((prev) => [thread, ...prev]);
    return thread;
  }, []);

  const deleteThread = useCallback(async (id: string) => {
    await tauri.deleteThread(id);
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateThreadTitle = useCallback(async (id: string, title: string) => {
    await tauri.updateThreadTitle(id, title);
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  }, []);

  return {
    threads,
    isLoading,
    error,
    createThread,
    deleteThread,
    updateThreadTitle,
    refresh,
  };
}
