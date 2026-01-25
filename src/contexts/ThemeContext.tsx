import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Theme, themes, loadSavedTheme, applyTheme, getTheme } from "@app/lib/themes";

interface ThemeContextValue {
  theme: Theme;
  themes: Theme[];
  setTheme: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => loadSavedTheme());

  useEffect(() => {
    // Apply theme on mount
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((id: string) => {
    const newTheme = getTheme(id);
    setThemeState(newTheme);
    applyTheme(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themes, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
