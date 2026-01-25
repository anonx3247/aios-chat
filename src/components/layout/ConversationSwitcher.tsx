import { useEffect, useState, useMemo } from "react";
import { MessageCircle } from "lucide-react";
import type { Thread } from "@app/types/thread";
import { Modal } from "@app/components/ui/Modal";

interface ConversationSwitcherProps {
  isOpen: boolean;
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export function ConversationSwitcher({
  isOpen,
  threads,
  activeThreadId,
  onSelect,
  onClose,
}: ConversationSwitcherProps) {
  // Get last 10 threads sorted by updatedAt
  const options = useMemo(() => {
    const recentThreads = [...threads]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);

    return [
      ...recentThreads.map((t) => ({ id: t.id, title: t.title ?? "New conversation" })),
      { id: null, title: "New Chat" },
    ];
  }, [threads]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when opening
  useEffect(() => {
    if (isOpen) {
      // Find the current thread index, or default to 0
      const currentIndex = options.findIndex((o) => o.id === activeThreadId);
      // Start at the next item (or 0 if not found)
      setSelectedIndex(currentIndex >= 0 ? (currentIndex + 1) % options.length : 0);
    }
  }, [isOpen, activeThreadId, options]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
        } else {
          setSelectedIndex((prev) => (prev + 1) % options.length);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = options[selectedIndex];
        if (selected !== undefined) {
          onSelect(selected.id);
        }
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Select when Ctrl is released
      if (e.key === "Control") {
        const selected = options[selectedIndex];
        if (selected !== undefined) {
          onSelect(selected.id);
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [isOpen, selectedIndex, options, onSelect, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-md p-4" closeOnEscape={false}>
      <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
        Switch Conversation
      </p>
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {options.map((option, index) => (
          <div
            key={option.id ?? "new"}
            className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors"
            style={{
              background: index === selectedIndex ? "var(--highlight)" : "transparent",
              color: index === selectedIndex ? "var(--fg-primary)" : "var(--fg-muted)",
            }}
          >
            <MessageCircle className="h-4 w-4 shrink-0 opacity-50" />
            <span className="truncate">{option.title}</span>
            {option.id === activeThreadId && (
              <span className="ml-auto text-xs" style={{ color: "var(--fg-muted)" }}>current</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs" style={{ color: "var(--fg-muted)" }}>
        Tab / Shift+Tab to navigate • Release Ctrl to select
      </p>
    </Modal>
  );
}
