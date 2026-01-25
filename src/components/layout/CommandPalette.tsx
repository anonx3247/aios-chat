import { useEffect, useState, useMemo, useCallback } from "react";
import { Search, MessageCircle, Plus, Palette, Settings } from "lucide-react";
import type { Thread } from "@app/types/thread";
import { Modal } from "@app/components/ui/Modal";

type CommandAction =
  | { type: "conversation"; id: string }
  | { type: "new-chat" }
  | { type: "theme" }
  | { type: "settings" };

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: typeof MessageCircle;
  action: CommandAction;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  threads: Thread[];
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenTheme: () => void;
  onOpenSettings: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let textIndex = 0;
  for (const char of lowerQuery) {
    const foundIndex = lowerText.indexOf(char, textIndex);
    if (foundIndex === -1) return false;
    textIndex = foundIndex + 1;
  }
  return true;
}

function fuzzyScore(text: string, query: string): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let score = 0;
  let textIndex = 0;
  let consecutiveMatches = 0;

  for (const char of lowerQuery) {
    const foundIndex = lowerText.indexOf(char, textIndex);
    if (foundIndex === -1) return -1;
    if (foundIndex === textIndex) {
      consecutiveMatches++;
      score += consecutiveMatches * 2;
    } else {
      consecutiveMatches = 0;
      score += 1;
    }
    if (foundIndex === 0 || lowerText[foundIndex - 1] === " ") {
      score += 5;
    }
    textIndex = foundIndex + 1;
  }
  return score;
}

export function CommandPalette({
  isOpen,
  threads,
  onClose,
  onSelectConversation,
  onNewChat,
  onOpenTheme,
  onOpenSettings,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build command items
  const allItems = useMemo((): CommandItem[] => {
    const commands: CommandItem[] = [
      {
        id: "new-chat",
        title: "New Chat",
        subtitle: "Start a new conversation",
        icon: Plus,
        action: { type: "new-chat" },
        keywords: ["new", "create", "start", "chat", "conversation"],
      },
      {
        id: "theme",
        title: "Change Theme",
        subtitle: "Switch color theme",
        icon: Palette,
        action: { type: "theme" },
        keywords: ["theme", "color", "dark", "light", "appearance"],
      },
      {
        id: "settings",
        title: "Settings",
        subtitle: "Open settings",
        icon: Settings,
        action: { type: "settings" },
        keywords: ["settings", "preferences", "config", "api", "key"],
      },
    ];

    const conversationItems: CommandItem[] = threads.map((t) => ({
      id: `conv-${t.id}`,
      title: t.title ?? "New conversation",
      icon: MessageCircle,
      action: { type: "conversation", id: t.id },
    }));

    return [...commands, ...conversationItems];
  }, [threads]);

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (query.trim() === "") {
      return allItems.slice(0, 15);
    }

    return allItems
      .filter((item) => {
        const searchText = [item.title, item.subtitle, ...(item.keywords ?? [])].join(" ");
        return fuzzyMatch(searchText, query);
      })
      .map((item) => {
        const searchText = [item.title, item.subtitle, ...(item.keywords ?? [])].join(" ");
        return { item, score: fuzzyScore(searchText, query) };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
      .slice(0, 15);
  }, [allItems, query]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  const executeAction = useCallback((action: CommandAction) => {
    onClose();
    switch (action.type) {
      case "conversation":
        onSelectConversation(action.id);
        break;
      case "new-chat":
        onNewChat();
        break;
      case "theme":
        onOpenTheme();
        break;
      case "settings":
        onOpenSettings();
        break;
    }
  }, [onClose, onSelectConversation, onNewChat, onOpenTheme, onOpenSettings]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const selected = filteredItems[selectedIndex];
        if (selected !== undefined) {
          executeAction(selected.action);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => { window.removeEventListener("keydown", handleKeyDown, true); };
  }, [isOpen, selectedIndex, filteredItems, onClose, executeAction]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} position="top" className="w-full max-w-xl" closeOnEscape={false}>
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-primary)" }}>
        <Search className="h-5 w-5" style={{ color: "var(--fg-muted)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          placeholder="Search commands and conversations..."
          className="flex-1 bg-transparent focus:outline-none"
          style={{ color: "var(--fg-primary)" }}
          autoFocus
        />
        <kbd className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--bg-tertiary)", color: "var(--fg-muted)" }}>
          esc
        </kbd>
      </div>

      <div className="max-h-80 overflow-y-auto p-2">
        {filteredItems.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            No results found
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { executeAction(item.action); }}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
                style={{
                  background: index === selectedIndex ? "var(--highlight)" : "transparent",
                  color: index === selectedIndex ? "var(--fg-primary)" : "var(--fg-secondary)",
                }}
                onMouseEnter={() => { setSelectedIndex(index); }}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{item.title}</span>
                  {item.subtitle !== undefined && (
                    <span className="text-xs truncate block" style={{ color: "var(--fg-muted)" }}>
                      {item.subtitle}
                    </span>
                  )}
                </div>
                {item.action.type !== "conversation" && (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--fg-muted)" }}>
                    command
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="border-t px-4 py-2" style={{ borderColor: "var(--border-primary)" }}>
        <p className="text-center text-xs" style={{ color: "var(--fg-muted)" }}>
          ↑↓ to navigate • Enter to select • Esc to close
        </p>
      </div>
    </Modal>
  );
}
