export interface Theme {
  name: string;
  id: string;
  colors: {
    // Backgrounds
    "bg-primary": string;
    "bg-secondary": string;
    "bg-tertiary": string;
    "bg-hover": string;
    "bg-active": string;
    "bg-input": string;
    "bg-accent": string;
    "bg-accent-hover": string;

    // Foregrounds
    "fg-primary": string;
    "fg-secondary": string;
    "fg-muted": string;
    "fg-accent": string;

    // Borders
    "border-primary": string;
    "border-secondary": string;

    // Special
    "highlight": string;
    "highlight-muted": string;
    "danger": string;
    "success": string;
  };
}

export const themes: Theme[] = [
  {
    name: "Warm Stone",
    id: "warm-stone",
    colors: {
      "bg-primary": "#1c1917",      // stone-900
      "bg-secondary": "#0c0a09",    // stone-950
      "bg-tertiary": "#292524",     // stone-800
      "bg-hover": "#44403c",        // stone-700
      "bg-active": "#57534e",       // stone-600
      "bg-input": "#292524",        // stone-800
      "bg-accent": "#b45309",       // amber-700
      "bg-accent-hover": "#d97706", // amber-600

      "fg-primary": "#fafaf9",      // stone-50
      "fg-secondary": "#a8a29e",    // stone-400
      "fg-muted": "#78716c",        // stone-500
      "fg-accent": "#fbbf24",       // amber-400

      "border-primary": "#292524",  // stone-800
      "border-secondary": "#44403c", // stone-700

      "highlight": "rgba(180, 83, 9, 0.3)",  // amber-700/30
      "highlight-muted": "rgba(180, 83, 9, 0.1)",
      "danger": "#ef4444",          // red-500
      "success": "#22c55e",         // green-500
    },
  },
  {
    name: "Cool Slate",
    id: "cool-slate",
    colors: {
      "bg-primary": "#0f172a",      // slate-900
      "bg-secondary": "#020617",    // slate-950
      "bg-tertiary": "#1e293b",     // slate-800
      "bg-hover": "#334155",        // slate-700
      "bg-active": "#475569",       // slate-600
      "bg-input": "#1e293b",        // slate-800
      "bg-accent": "#2563eb",       // blue-600
      "bg-accent-hover": "#3b82f6", // blue-500

      "fg-primary": "#f8fafc",      // slate-50
      "fg-secondary": "#94a3b8",    // slate-400
      "fg-muted": "#64748b",        // slate-500
      "fg-accent": "#60a5fa",       // blue-400

      "border-primary": "#1e293b",  // slate-800
      "border-secondary": "#334155", // slate-700

      "highlight": "rgba(37, 99, 235, 0.3)",  // blue-600/30
      "highlight-muted": "rgba(37, 99, 235, 0.1)",
      "danger": "#ef4444",
      "success": "#22c55e",
    },
  },
  {
    name: "Midnight Purple",
    id: "midnight-purple",
    colors: {
      "bg-primary": "#18181b",      // zinc-900
      "bg-secondary": "#09090b",    // zinc-950
      "bg-tertiary": "#27272a",     // zinc-800
      "bg-hover": "#3f3f46",        // zinc-700
      "bg-active": "#52525b",       // zinc-600
      "bg-input": "#27272a",        // zinc-800
      "bg-accent": "#7c3aed",       // violet-600
      "bg-accent-hover": "#8b5cf6", // violet-500

      "fg-primary": "#fafafa",      // zinc-50
      "fg-secondary": "#a1a1aa",    // zinc-400
      "fg-muted": "#71717a",        // zinc-500
      "fg-accent": "#a78bfa",       // violet-400

      "border-primary": "#27272a",  // zinc-800
      "border-secondary": "#3f3f46", // zinc-700

      "highlight": "rgba(124, 58, 237, 0.3)",  // violet-600/30
      "highlight-muted": "rgba(124, 58, 237, 0.1)",
      "danger": "#ef4444",
      "success": "#22c55e",
    },
  },
  {
    name: "Forest Green",
    id: "forest-green",
    colors: {
      "bg-primary": "#14120f",
      "bg-secondary": "#0a0908",
      "bg-tertiary": "#1f1d1a",
      "bg-hover": "#2d2a26",
      "bg-active": "#3d3935",
      "bg-input": "#1f1d1a",
      "bg-accent": "#15803d",       // green-700
      "bg-accent-hover": "#16a34a", // green-600

      "fg-primary": "#fafaf9",
      "fg-secondary": "#a8a29e",
      "fg-muted": "#78716c",
      "fg-accent": "#4ade80",       // green-400

      "border-primary": "#1f1d1a",
      "border-secondary": "#2d2a26",

      "highlight": "rgba(21, 128, 61, 0.3)",
      "highlight-muted": "rgba(21, 128, 61, 0.1)",
      "danger": "#ef4444",
      "success": "#22c55e",
    },
  },
  {
    name: "Rose Gold",
    id: "rose-gold",
    colors: {
      "bg-primary": "#1c1917",
      "bg-secondary": "#0c0a09",
      "bg-tertiary": "#292524",
      "bg-hover": "#44403c",
      "bg-active": "#57534e",
      "bg-input": "#292524",
      "bg-accent": "#be123c",       // rose-700
      "bg-accent-hover": "#e11d48", // rose-600

      "fg-primary": "#fafaf9",
      "fg-secondary": "#a8a29e",
      "fg-muted": "#78716c",
      "fg-accent": "#fb7185",       // rose-400

      "border-primary": "#292524",
      "border-secondary": "#44403c",

      "highlight": "rgba(190, 18, 60, 0.3)",
      "highlight-muted": "rgba(190, 18, 60, 0.1)",
      "danger": "#ef4444",
      "success": "#22c55e",
    },
  },
];

// Default theme is always the first one (Warm Stone)
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Array is guaranteed non-empty
const defaultTheme = themes[0]!

export function getTheme(id: string): Theme {
  return themes.find((t) => t.id === id) ?? defaultTheme;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
  localStorage.setItem("theme", theme.id);
}

export function loadSavedTheme(): Theme {
  const savedId = localStorage.getItem("theme");
  const theme = savedId !== null ? getTheme(savedId) : defaultTheme;
  applyTheme(theme);
  return theme;
}
