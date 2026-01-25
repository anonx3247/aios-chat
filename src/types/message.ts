export interface Message {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface NewMessage {
  role: "user" | "assistant";
  content: string;
}
