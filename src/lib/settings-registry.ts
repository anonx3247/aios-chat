/**
 * Settings Registry
 *
 * Defines the hierarchical settings page structure.
 * Keys use dot-notation: "settings.email.password", "settings.keys.perplexity", etc.
 */

export interface SettingsPage {
  id: string;
  label: string;
  parentId?: string;
}

/**
 * All settings pages in a flat map. The hierarchy is encoded in the id:
 *   settings.provider  → top-level page
 *   settings.email     → top-level page
 *   settings.email.password → sub-page of settings.email
 */
export const SETTINGS_PAGES: Record<string, SettingsPage> = {
  "settings.provider": {
    id: "settings.provider",
    label: "AI Provider",
  },
  "settings.keys": {
    id: "settings.keys",
    label: "API Keys",
  },
  "settings.keys.anthropic": {
    id: "settings.keys.anthropic",
    label: "Anthropic API Key",
    parentId: "settings.keys",
  },
  "settings.keys.perplexity": {
    id: "settings.keys.perplexity",
    label: "Perplexity API Key",
    parentId: "settings.keys",
  },
  "settings.keys.firecrawl": {
    id: "settings.keys.firecrawl",
    label: "Firecrawl API Key",
    parentId: "settings.keys",
  },
  "settings.personality": {
    id: "settings.personality",
    label: "Personality",
  },
  "settings.email": {
    id: "settings.email",
    label: "Email",
  },
  "settings.email.password": {
    id: "settings.email.password",
    label: "Email Password",
    parentId: "settings.email",
  },
  "settings.email.imap": {
    id: "settings.email.imap",
    label: "IMAP Settings",
    parentId: "settings.email",
  },
  "settings.email.smtp": {
    id: "settings.email.smtp",
    label: "SMTP Settings",
    parentId: "settings.email",
  },
};

/** Top-level pages shown in the nav sidebar */
export const TOP_LEVEL_PAGES = ["settings.provider", "settings.keys", "settings.personality", "settings.email"] as const;

/**
 * Resolve a hierarchical key to a page and optional sub-filter.
 * E.g. "settings.email.password" → { page: SETTINGS_PAGES["settings.email"], subFilter: "password" }
 * E.g. "settings.email" → { page: SETTINGS_PAGES["settings.email"], subFilter: undefined }
 * E.g. "email" → { page: SETTINGS_PAGES["settings.email"], subFilter: undefined }  (legacy flat key)
 */
export function resolveSettingsPath(key: string): { pageId: string; subFilter?: string | undefined } {
  // Normalize: add "settings." prefix if missing
  const normalized = key.startsWith("settings.") ? key : `settings.${key}`;

  // Direct match
  const matchedPage = SETTINGS_PAGES[normalized];
  if (matchedPage !== undefined) {
    if (matchedPage.parentId !== undefined) {
      // It's a sub-page, navigate to parent with sub-filter
      const subFilter = normalized.split(".").pop();
      return { pageId: matchedPage.parentId, subFilter };
    }
    return { pageId: normalized };
  }

  // Legacy flat keys: "email" → "settings.email", "perplexity" → "settings.keys.perplexity"
  const legacyMap: Record<string, { pageId: string; subFilter?: string }> = {
    email: { pageId: "settings.email" },
    perplexity: { pageId: "settings.keys", subFilter: "perplexity" },
    firecrawl: { pageId: "settings.keys", subFilter: "firecrawl" },
    anthropic: { pageId: "settings.keys", subFilter: "anthropic" },
    ollama: { pageId: "settings.provider" },
  };

  return legacyMap[key] ?? { pageId: "settings.provider" };
}

/**
 * Get a human-readable label for a settings key.
 */
export function getSettingsLabel(key: string): string {
  const normalized = key.startsWith("settings.") ? key : `settings.${key}`;
  return SETTINGS_PAGES[normalized]?.label ?? key;
}
