import { useCallback, useState, useEffect } from "react";
import { Settings, Sparkles, ChevronRight } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SettingsModal } from "./SettingsModal";
import { ConversationSwitcher } from "./ConversationSwitcher";
import { CommandPalette } from "./CommandPalette";
import { ThemeSelector } from "./ThemeSelector";
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isThemeSelectorOpen, setIsThemeSelectorOpen] = useState(false);

  const handleNewChat = useCallback(async () => {
    const thread = await createThread();
    setActiveThreadId(thread.id);
  }, [createThread]);

  const handleStartChatWithMessage = useCallback(async (message: string) => {
    const thread = await createThread();
    setPendingMessage(message);
    setActiveThreadId(thread.id);
  }, [createThread]);

  // Clear pending message after it's been consumed
  const handleMessageConsumed = useCallback(() => {
    setPendingMessage(null);
  }, []);

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

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Expand sidebar when mouse is near left edge
  useEffect(() => {
    if (!isSidebarCollapsed) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX <= 8) {
        setIsSidebarCollapsed(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => { window.removeEventListener("mousemove", handleMouseMove); };
  }, [isSidebarCollapsed]);

  // Keyboard shortcuts: Cmd+N (new chat), Ctrl+Tab (switch), Cmd+K (command palette)
  // Only intercept our specific shortcuts, let everything else pass through
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab: Open conversation switcher
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        if (!isSwitcherOpen) {
          setIsSwitcherOpen(true);
        }
        return;
      }

      // Only handle Cmd/Ctrl shortcuts
      if (!e.metaKey && !e.ctrlKey) return;

      // Cmd+N: New chat (works everywhere)
      if (e.key === "n") {
        e.preventDefault();
        e.stopPropagation();
        setActiveThreadId(null);
        return;
      }

      // Cmd+K: Open command palette (works everywhere)
      if (e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setIsCommandPaletteOpen(true);
        return;
      }

      // All other Cmd shortcuts (Cmd+A, Cmd+C, Cmd+V, etc.) - don't interfere
    };

    // Use capture phase to intercept before browser handles Ctrl+Tab
    window.addEventListener("keydown", handleKeyDown, true);
    return () => { window.removeEventListener("keydown", handleKeyDown, true); };
  }, [isSwitcherOpen]);

  // Handle mouse leaving sidebar area to collapse
  const handleSidebarMouseLeave = useCallback(() => {
    // Small delay to prevent accidental collapse
    setTimeout(() => {
      setIsSidebarCollapsed(true);
    }, 300);
  }, []);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-primary)", color: "var(--fg-primary)" }}>
      {/* Hover zone to expand collapsed sidebar */}
      {isSidebarCollapsed && (
        <div
          className="absolute left-0 top-0 z-40 flex h-full w-2 cursor-pointer items-center"
          onClick={() => { setIsSidebarCollapsed(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") setIsSidebarCollapsed(false); }}
          role="button"
          tabIndex={0}
          aria-label="Expand sidebar"
        >
          <div
            className="ml-1 rounded-full p-1 opacity-0 transition-opacity hover:opacity-100"
            style={{ background: "var(--bg-hover)" }}
          >
            <ChevronRight className="h-3 w-3" style={{ color: "var(--fg-secondary)" }} />
          </div>
        </div>
      )}
      <Sidebar
        threads={threads}
        activeThreadId={activeThreadId}
        isLoading={isLoading}
        isCollapsed={isSidebarCollapsed}
        onNewChat={() => void handleNewChat()}
        onSelectThread={handleSelectThread}
        onDeleteThread={(id) => void handleDeleteThread(id)}
        onToggleCollapse={handleToggleSidebar}
        onMouseLeave={handleSidebarMouseLeave}
      />
      <main className="flex flex-1 flex-col">
        <header
          className="flex items-center justify-between border-b px-6 py-3 backdrop-blur"
          style={{ borderColor: "var(--border-primary)", background: "var(--bg-primary)" }}
        >
          <div className="flex items-center gap-2">
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => { setIsSidebarCollapsed(false); }}
                className="mr-2 rounded-lg p-2 transition-colors"
                style={{ color: "var(--fg-muted)" }}
                title="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "var(--fg-accent)" }} />
            </div>
            <h1 className="text-lg font-semibold">AIOS Chat</h1>
          </div>
          <button
            type="button"
            onClick={() => { setIsSettingsOpen(true); }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
            style={{ color: "var(--fg-muted)" }}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </header>
        <div className="flex-1 overflow-hidden">
          <ChatThread
            threadId={activeThreadId}
            onTitleGenerated={handleTitleGenerated}
            onStartChatWithMessage={(msg) => void handleStartChatWithMessage(msg)}
            onSelectThread={handleSelectThread}
            recentThreads={threads}
            initialMessage={pendingMessage}
            onInitialMessageConsumed={handleMessageConsumed}
          />
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => { setIsSettingsOpen(false); }}
      />

      <ConversationSwitcher
        isOpen={isSwitcherOpen}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelect={(id) => { setActiveThreadId(id); }}
        onClose={() => { setIsSwitcherOpen(false); }}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        threads={threads}
        onClose={() => { setIsCommandPaletteOpen(false); }}
        onSelectConversation={(id) => { setActiveThreadId(id); }}
        onNewChat={() => void handleNewChat()}
        onOpenTheme={() => { setIsThemeSelectorOpen(true); }}
        onOpenSettings={() => { setIsSettingsOpen(true); }}
      />

      <ThemeSelector
        isOpen={isThemeSelectorOpen}
        onClose={() => { setIsThemeSelectorOpen(false); }}
      />
    </div>
  );
}
