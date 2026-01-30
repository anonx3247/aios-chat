/**
 * AskUserQuestion - Inline question UI above chat composer
 *
 * Renders interactive question forms with keyboard navigation:
 * - Arrow keys to navigate options
 * - Enter to submit
 * - Space to toggle (multi-select)
 * - Escape to cancel
 * - Y/N for confirm type
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Check, ChevronLeft, ChevronRight } from "lucide-react";

export interface AskUserQuestionArgs {
  question: string;
  type: "confirm" | "single_select" | "multi_select" | "text";
  options?: { value: string; label: string; description?: string }[];
  page_size?: number;
  placeholder?: string;
  allow_cancel?: boolean;
}

interface AskUserQuestionProps {
  args: AskUserQuestionArgs;
  onSubmit: (response: unknown) => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

export function AskUserQuestion({ args, onSubmit, onCancel }: AskUserQuestionProps) {
  const { question, type, options = [], page_size = 5, placeholder, allow_cancel = true } = args;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [textValue, setTextValue] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pagination
  const totalPages = Math.ceil(options.length / page_size);
  const startIndex = currentPage * page_size;
  const visibleOptions = options.slice(startIndex, startIndex + page_size);

  // Focus container on mount
  useEffect(() => {
    if (type === "text") {
      inputRef.current?.focus();
    } else {
      containerRef.current?.focus();
    }
  }, [type]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        if (allow_cancel) {
          e.preventDefault();
          void onCancel();
        }
        break;

      case "Enter":
        e.preventDefault();
        if (type === "confirm") {
          void onSubmit(true);
        } else if (type === "single_select") {
          void onSubmit(visibleOptions[selectedIndex]?.value);
        } else if (type === "multi_select") {
          void onSubmit(Array.from(selectedValues));
        } else {
          // type === "text"
          if (textValue.trim().length > 0) {
            void onSubmit(textValue.trim());
          }
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (type !== "text" && type !== "confirm") {
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        }
        break;

      case "ArrowDown":
        e.preventDefault();
        if (type !== "text" && type !== "confirm") {
          setSelectedIndex((prev) => Math.min(visibleOptions.length - 1, prev + 1));
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (totalPages > 1 && currentPage > 0) {
          setCurrentPage((prev) => prev - 1);
          setSelectedIndex(0);
        }
        break;

      case "ArrowRight":
        e.preventDefault();
        if (totalPages > 1 && currentPage < totalPages - 1) {
          setCurrentPage((prev) => prev + 1);
          setSelectedIndex(0);
        }
        break;

      case " ":
        if (type === "multi_select") {
          e.preventDefault();
          const value = visibleOptions[selectedIndex]?.value;
          if (value !== undefined) {
            setSelectedValues((prev) => {
              const next = new Set(prev);
              if (next.has(value)) {
                next.delete(value);
              } else {
                next.add(value);
              }
              return next;
            });
          }
        }
        break;

      case "y":
      case "Y":
        if (type === "confirm") {
          e.preventDefault();
          void onSubmit(true);
        }
        break;

      case "n":
      case "N":
        if (type === "confirm") {
          e.preventDefault();
          void onSubmit(false);
        }
        break;
    }
  }, [type, selectedIndex, visibleOptions, selectedValues, textValue, totalPages, currentPage, allow_cancel, onSubmit, onCancel]);

  // Toggle option for multi-select
  const toggleOption = (value: string) => {
    setSelectedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  return (
    <div
      ref={containerRef}
      tabIndex={type !== "text" ? 0 : undefined}
      onKeyDown={handleKeyDown}
      className="overflow-hidden rounded-2xl border outline-none"
      style={{
        background: "var(--bg-tertiary)",
        borderColor: "var(--border-primary)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 px-4 py-3"
        style={{ background: "var(--bg-secondary)" }}
      >
        <span className="text-sm" style={{ color: "var(--fg-primary)" }}>
          {question}
        </span>
        {allow_cancel && (
          <button
            type="button"
            onClick={() => { void onCancel(); }}
            className="shrink-0 rounded-md p-1 transition-opacity hover:opacity-70"
            style={{ color: "var(--fg-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-2">
        {/* Confirm type */}
        {type === "confirm" && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { void onSubmit(true); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all hover:opacity-90"
              style={{ background: "var(--success)", color: "white" }}
            >
              <Check className="h-4 w-4" />
              Yes
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-xs">Y</kbd>
            </button>
            <button
              type="button"
              onClick={() => { void onSubmit(false); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all hover:opacity-90"
              style={{ background: "var(--bg-hover)", color: "var(--fg-primary)" }}
            >
              <X className="h-4 w-4" />
              No
              <kbd className="ml-1 rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--bg-active)" }}>N</kbd>
            </button>
          </div>
        )}

        {/* Single select */}
        {type === "single_select" && (
          <div className="space-y-1">
            {visibleOptions.map((option, index) => {
              const isFocused = index === selectedIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { void onSubmit(option.value); }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: isFocused ? "var(--bg-active)" : "var(--bg-hover)",
                    outline: isFocused ? "2px solid var(--fg-accent)" : "none",
                    outlineOffset: "-2px",
                  }}
                >
                  <div
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                    style={{
                      borderColor: isFocused ? "var(--bg-accent)" : "var(--fg-muted)",
                      background: isFocused ? "var(--bg-accent)" : "transparent",
                    }}
                  >
                    {isFocused && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>{option.label}</span>
                    {option.description !== undefined && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {option.description}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Multi select */}
        {type === "multi_select" && (
          <div className="space-y-1">
            {visibleOptions.map((option, index) => {
              const isSelected = selectedValues.has(option.value);
              const isFocused = index === selectedIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { toggleOption(option.value); }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: isFocused ? "var(--bg-active)" : "var(--bg-hover)",
                    outline: isFocused ? "2px solid var(--fg-accent)" : "none",
                    outlineOffset: "-2px",
                  }}
                >
                  <div
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors"
                    style={{
                      borderColor: isSelected ? "var(--bg-accent)" : "var(--fg-muted)",
                      background: isSelected ? "var(--bg-accent)" : "transparent",
                    }}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
                      {option.label}
                    </span>
                    {option.description !== undefined && (
                      <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
                        {option.description}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { void onSubmit(Array.from(selectedValues)); }}
              disabled={selectedValues.size === 0}
              className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
              style={{ background: "var(--bg-accent)", color: "white" }}
            >
              Submit ({selectedValues.size} selected)
            </button>
          </div>
        )}

        {/* Text input */}
        {type === "text" && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={textValue}
              onChange={(e) => { setTextValue(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder ?? "Type your response..."}
              className="flex-1 rounded-xl border-0 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{
                background: "var(--bg-hover)",
                color: "var(--fg-primary)",
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (textValue.trim().length > 0) {
                  void onSubmit(textValue.trim());
                }
              }}
              disabled={textValue.trim().length === 0}
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
              style={{ background: "var(--bg-accent)", color: "white" }}
            >
              Submit
            </button>
          </div>
        )}
      </div>

      {/* Footer with pagination and hints */}
      <div
        className="flex items-center justify-between border-t px-3 py-2"
        style={{ borderColor: "var(--border-secondary)" }}
      >
        {/* Keyboard hints */}
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--fg-muted)" }}>
          {type !== "text" && type !== "confirm" && (
            <span className="flex items-center gap-1">
              <kbd className="rounded px-1" style={{ background: "var(--bg-hover)" }}>↑↓</kbd>
              Navigate
            </span>
          )}
          {type === "multi_select" && (
            <span className="flex items-center gap-1">
              <kbd className="rounded px-1" style={{ background: "var(--bg-hover)" }}>Space</kbd>
              Toggle
            </span>
          )}
          {type !== "confirm" && (
            <span className="flex items-center gap-1">
              <kbd className="rounded px-1" style={{ background: "var(--bg-hover)" }}>Enter</kbd>
              Submit
            </span>
          )}
          {allow_cancel && (
            <span className="flex items-center gap-1">
              <kbd className="rounded px-1" style={{ background: "var(--bg-hover)" }}>Esc</kbd>
              Cancel
            </span>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setCurrentPage((p) => Math.max(0, p - 1)); setSelectedIndex(0); }}
              disabled={currentPage === 0}
              className="rounded p-1 transition-opacity disabled:opacity-30"
              style={{ color: "var(--fg-muted)" }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {currentPage + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => { setCurrentPage((p) => Math.min(totalPages - 1, p + 1)); setSelectedIndex(0); }}
              disabled={currentPage === totalPages - 1}
              className="rounded p-1 transition-opacity disabled:opacity-30"
              style={{ color: "var(--fg-muted)" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
