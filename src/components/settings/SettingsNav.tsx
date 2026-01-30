import { Bot, Key, Mail } from "lucide-react";
import { TOP_LEVEL_PAGES, SETTINGS_PAGES } from "@app/lib/settings-registry";
import type { LucideIcon } from "lucide-react";

const PAGE_ICONS: Record<string, LucideIcon> = {
  "settings.provider": Bot,
  "settings.keys": Key,
  "settings.email": Mail,
};

interface SettingsNavProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
}

export function SettingsNav({ activePage, onNavigate }: SettingsNavProps) {
  return (
    <nav className="flex w-44 shrink-0 flex-col gap-1 border-r pr-4" style={{ borderColor: "var(--border-secondary)" }}>
      {TOP_LEVEL_PAGES.map((pageId) => {
        const page = SETTINGS_PAGES[pageId];
        if (page === undefined) return null;
        const Icon = PAGE_ICONS[pageId];
        const isActive = activePage === pageId;

        return (
          <button
            key={pageId}
            type="button"
            onClick={() => { onNavigate(pageId); }}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
            style={{
              background: isActive ? "var(--bg-tertiary)" : "transparent",
              color: isActive ? "var(--fg-primary)" : "var(--fg-muted)",
            }}
          >
            {Icon && <Icon className="h-4 w-4" style={{ color: isActive ? "var(--fg-accent)" : "var(--fg-muted)" }} />}
            {page.label}
          </button>
        );
      })}
    </nav>
  );
}
