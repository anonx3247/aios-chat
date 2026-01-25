import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { Modal } from "@app/components/ui/Modal";
import { useTheme } from "@app/contexts/ThemeContext";

interface ThemeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeSelector({ isOpen, onClose }: ThemeSelectorProps) {
  const { theme: currentTheme, themes, setTheme } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = themes.findIndex((t) => t.id === currentTheme.id);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentTheme.id, themes]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.min(prev + 1, themes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const selected = themes[selectedIndex];
        if (selected !== undefined) {
          setTheme(selected.id);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => { window.removeEventListener("keydown", handleKeyDown, true); };
  }, [isOpen, selectedIndex, themes, setTheme, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-md p-4" closeOnEscape={false}>
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <Palette className="h-5 w-5" style={{ color: "var(--fg-accent)" }} />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--fg-primary)" }}>
          Choose Theme
        </h2>
      </div>

      <div className="space-y-2">
        {themes.map((theme, index) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => {
              setTheme(theme.id);
              onClose();
            }}
            onMouseEnter={() => { setSelectedIndex(index); }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
            style={{
              background: index === selectedIndex ? "var(--highlight)" : "transparent",
              color: index === selectedIndex ? "var(--fg-primary)" : "var(--fg-secondary)",
            }}
          >
            {/* Color preview dots */}
            <div className="flex gap-1">
              <div
                className="h-4 w-4 rounded-full"
                style={{ background: theme.colors["bg-accent"] }}
              />
              <div
                className="h-4 w-4 rounded-full"
                style={{ background: theme.colors["fg-accent"] }}
              />
              <div
                className="h-4 w-4 rounded-full"
                style={{ background: theme.colors["bg-tertiary"] }}
              />
            </div>

            <span className="flex-1">{theme.name}</span>

            {currentTheme.id === theme.id && (
              <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid var(--border-primary)` }}>
        <p className="text-center text-xs" style={{ color: "var(--fg-muted)" }}>
          ↑↓ to navigate • Enter to select • Esc to close
        </p>
      </div>
    </Modal>
  );
}
