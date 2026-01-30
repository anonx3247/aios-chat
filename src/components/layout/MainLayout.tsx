import { useCallback, useState, useEffect } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SettingsModal } from "./SettingsModal";
import { ConversationSwitcher } from "./ConversationSwitcher";
import { CommandPalette } from "./CommandPalette";
import { ThemeSelector } from "./ThemeSelector";
import { ChatThread } from "@app/components/chat/ChatThread";
import { AgentTaskPanel } from "@app/components/agent/AgentTaskPanel";
import { DocumentPanel } from "@app/components/document/DocumentPanel";
import { useThreads } from "@app/hooks/useThreads";
import { useAgentSession } from "@app/hooks/useAgentSession";
import { useDocumentStore } from "@app/stores/document-store";

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
  const [isTaskPanelVisible, setIsTaskPanelVisible] = useState(true);

  // Get agent session for the active thread
  const { session: agentSession } = useAgentSession(activeThreadId);
  const hasDocument = useDocumentStore((s) => s.document !== null);

  // Show task panel when there's an active session and panel is visible
  const hasActiveSession = agentSession !== null;
  const showTaskPanel = hasActiveSession && isTaskPanelVisible;

  // Re-show panel when session becomes active
  const handleShowTaskPanel = useCallback(() => {
    setIsTaskPanelVisible(true);
  }, []);

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
        onOpenSettings={() => { setIsSettingsOpen(true); }}
      />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
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
        {hasDocument && <DocumentPanel />}
        {showTaskPanel && !hasDocument && (
          <AgentTaskPanel
            threadId={activeThreadId}
            onClose={() => { setIsTaskPanelVisible(false); }}
          />
        )}
        {/* Button to reopen task panel when hidden but session exists */}
        {hasActiveSession && !isTaskPanelVisible && (
          <button
            type="button"
            onClick={handleShowTaskPanel}
            className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg px-3 py-2 shadow-lg transition-colors"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-secondary)",
              color: "var(--fg-accent)",
            }}
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Agent Tasks</span>
          </button>
        )}
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
