import { useCallback, useEffect, useState } from "react";
import type { Message, NewMessage } from "@app/types/message";
import * as tauri from "@app/lib/tauri";

interface UsePersistenceResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  saveMessage: (message: NewMessage) => Promise<Message>;
  deleteMessage: (messageId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePersistence(threadId: string | null): UsePersistenceResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (threadId === null) {
      setMessages([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await tauri.getMessages(threadId);
      setMessages(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveMessage = useCallback(
    async (message: NewMessage) => {
      if (threadId === null) {
        throw new Error("No thread selected");
      }
      const saved = await tauri.saveMessage(threadId, message);
      setMessages((prev) => [...prev, saved]);
      return saved;
    },
    [threadId]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      await tauri.deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    []
  );

  return {
    messages,
    isLoading,
    error,
    saveMessage,
    deleteMessage,
    refresh,
  };
}
