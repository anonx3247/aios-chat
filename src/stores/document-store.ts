import { create } from "zustand";

export type DocumentState =
  | { mode: "content"; title: string; content: string }
  | { mode: "document"; title: string; uri: string }
  | null;

interface DocumentStore {
  document: DocumentState;
  showContent: (title: string, content: string) => void;
  showDocument: (uri: string, title?: string) => void;
  close: () => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  document: null,
  showContent: (title, content) => { set({ document: { mode: "content", title, content } }); },
  showDocument: (uri, title) => {
    set({ document: { mode: "document", title: title ?? uri.split("/").pop() ?? "Document", uri } });
  },
  close: () => { set({ document: null }); },
}));
