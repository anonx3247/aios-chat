import { invoke } from "@tauri-apps/api/core";
import type { Thread } from "@app/types/thread";
import type { Message, NewMessage } from "@app/types/message";

export async function createThread(): Promise<Thread> {
  return invoke<Thread>("create_thread");
}

export async function listThreads(): Promise<Thread[]> {
  return invoke<Thread[]>("list_threads");
}

export async function deleteThread(id: string): Promise<void> {
  await invoke("delete_thread", { id });
}

export async function updateThreadTitle(
  id: string,
  title: string
): Promise<void> {
  await invoke("update_thread_title", { id, title });
}

export async function saveMessage(
  threadId: string,
  message: NewMessage
): Promise<Message> {
  return invoke<Message>("save_message", { threadId, message });
}

export async function getMessages(threadId: string): Promise<Message[]> {
  return invoke<Message[]>("get_messages", { threadId });
}

export async function deleteMessage(messageId: string): Promise<void> {
  await invoke("delete_message", { messageId });
}
