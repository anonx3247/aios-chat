/**
 * DynamicUI - Themed wrapper for dynamic-ui-mcp components
 *
 * Wraps DynamicUIRenderer to inject our theme CSS variables
 * so that generated components follow the app's color scheme.
 */
import React, { useState, useEffect, useCallback } from "react";
import { DynamicUIRenderer, type ToolInvocation } from "dynamic-ui-mcp/react";
import * as Recharts from "recharts";
import Prism from "prismjs";

// Persistence for submitted tool invocations
const SUBMITTED_TOOLS_KEY = "aios-chat-submitted-tools";

function getSubmittedTools(): Set<string> {
  try {
    const stored = localStorage.getItem(SUBMITTED_TOOLS_KEY);
    if (stored !== null) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function markToolSubmitted(toolCallId: string): void {
  const submitted = getSubmittedTools();
  submitted.add(toolCallId);
  // Keep only last 100 entries to prevent unbounded growth
  const arr = Array.from(submitted).slice(-100);
  localStorage.setItem(SUBMITTED_TOOLS_KEY, JSON.stringify(arr));
}

// Import Prism language support
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-sql";

interface DynamicUIProps {
  toolInvocation: ToolInvocation;
  onSubmit?: (data: unknown) => void;
}

/**
 * Get current theme colors from CSS variables
 */
function getThemeColors(): Record<string, string> {
  const root = document.documentElement;
  const style = getComputedStyle(root);

  return {
    bgPrimary: style.getPropertyValue("--bg-primary").trim(),
    bgSecondary: style.getPropertyValue("--bg-secondary").trim(),
    bgTertiary: style.getPropertyValue("--bg-tertiary").trim(),
    bgHover: style.getPropertyValue("--bg-hover").trim(),
    bgActive: style.getPropertyValue("--bg-active").trim(),
    bgInput: style.getPropertyValue("--bg-input").trim(),
    bgAccent: style.getPropertyValue("--bg-accent").trim(),
    bgAccentHover: style.getPropertyValue("--bg-accent-hover").trim(),
    fgPrimary: style.getPropertyValue("--fg-primary").trim(),
    fgSecondary: style.getPropertyValue("--fg-secondary").trim(),
    fgMuted: style.getPropertyValue("--fg-muted").trim(),
    fgAccent: style.getPropertyValue("--fg-accent").trim(),
    borderPrimary: style.getPropertyValue("--border-primary").trim(),
    borderSecondary: style.getPropertyValue("--border-secondary").trim(),
    success: style.getPropertyValue("--success").trim(),
    danger: style.getPropertyValue("--danger").trim(),
  };
}

/**
 * Themed DynamicUI component
 */
export function DynamicUI({ toolInvocation, onSubmit }: DynamicUIProps) {
  const [isSubmitted, setIsSubmitted] = useState(() =>
    getSubmittedTools().has(toolInvocation.toolCallId)
  );

  // Check submitted state on mount and when toolCallId changes
  useEffect(() => {
    setIsSubmitted(getSubmittedTools().has(toolInvocation.toolCallId));
  }, [toolInvocation.toolCallId]);

  // Wrap onSubmit to persist submitted state
  const handleSubmit = useCallback((data: unknown) => {
    markToolSubmitted(toolInvocation.toolCallId);
    setIsSubmitted(true);
    onSubmit?.(data);
  }, [toolInvocation.toolCallId, onSubmit]);

  // Skip non-render tools
  if (!toolInvocation.toolName.startsWith("render")) {
    return null;
  }

  // Wrapper styles using our CSS variables
  const wrapperStyle: React.CSSProperties = {
    background: "var(--bg-tertiary)",
    borderRadius: "12px",
    padding: "16px",
    marginTop: "8px",
    border: "1px solid var(--border-primary)",
    color: "var(--fg-primary)",
    maxWidth: "100%",
    width: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  };

  // Submitted state component
  const submittedComponent = (
    <div
      style={{
        ...wrapperStyle,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        borderLeft: "3px solid var(--success)",
      }}
    >
      <span style={{ fontSize: "18px", color: "var(--success)" }}>✓</span>
      <span style={{ color: "var(--fg-secondary)" }}>Response submitted</span>
    </div>
  );

  // Show submitted state if already completed
  if (isSubmitted) {
    return submittedComponent;
  }

  // Show loading state while tool is being called (before result arrives)
  if (toolInvocation.state === "call" || toolInvocation.state === "partial-call") {
    return (
      <div
        style={{
          ...wrapperStyle,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: "var(--fg-muted)",
        }}
      >
        <div
          style={{
            width: "20px",
            height: "20px",
            border: "2px solid var(--border-secondary)",
            borderTopColor: "var(--fg-accent)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <span>Generating component...</span>
      </div>
    );
  }

  // Get theme colors for passing to components
  const theme = getThemeColors();

  // Custom libraries including theme
  const libraries = {
    react: React,
    React,
    prismjs: Prism,
    Prism,
    recharts: Recharts,
    Recharts,
    // Provide theme as a library components can import
    theme,
  };

  // Loading component (for internal DynamicUIRenderer loading)
  const loadingComponent = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        color: "var(--fg-muted)",
      }}
    >
      <div
        style={{
          width: "16px",
          height: "16px",
          border: "2px solid var(--border-secondary)",
          borderTopColor: "var(--fg-accent)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <span>Compiling component...</span>
    </div>
  );

  // Error component
  const errorComponent = (error: string) => (
    <div
      style={{
        background: "var(--bg-secondary)",
        borderRadius: "8px",
        padding: "12px",
        borderLeft: "3px solid var(--danger)",
        color: "var(--danger)",
      }}
    >
      <strong>Error rendering component:</strong>
      <pre style={{ marginTop: "8px", fontSize: "12px", whiteSpace: "pre-wrap", color: "var(--fg-secondary)" }}>
        {error}
      </pre>
    </div>
  );

  // Submitted state component (for DynamicUIRenderer internal use)
  const internalSubmittedComponent = (
    <div
      style={{
        background: "var(--bg-secondary)",
        borderRadius: "8px",
        padding: "12px",
        borderLeft: "3px solid var(--success)",
        color: "var(--success)",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <span style={{ fontSize: "18px" }}>✓</span>
      <span>Response submitted</span>
    </div>
  );

  // Handle the onSubmit prop - use our wrapped handler for persistence
  const rendererProps = {
    toolInvocation,
    libraries,
    loadingComponent,
    errorComponent,
    submittedComponent: internalSubmittedComponent,
    onSubmit: handleSubmit,
  };

  return (
    <div style={wrapperStyle} className="dynamic-ui-container">
      {/* Inject scoped styles for themed form elements */}
      <style>{`
        .dynamic-ui-container {
          --dui-bg: var(--bg-tertiary);
          --dui-bg-input: var(--bg-hover);
          --dui-bg-button: var(--bg-accent);
          --dui-bg-button-hover: var(--bg-accent-hover);
          --dui-fg: var(--fg-primary);
          --dui-fg-muted: var(--fg-muted);
          --dui-border: var(--border-secondary);
          max-width: 100% !important;
          overflow: hidden !important;
        }

        /* Force all nested divs to use theme background and constrain width */
        .dynamic-ui-container,
        .dynamic-ui-container > *,
        .dynamic-ui-container div {
          background-color: transparent !important;
          color: var(--fg-primary) !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }

        /* Override any white/light backgrounds */
        .dynamic-ui-container [style*="background"],
        .dynamic-ui-container [style*="Background"] {
          background-color: var(--bg-tertiary) !important;
        }

        /* All text should be readable */
        .dynamic-ui-container span,
        .dynamic-ui-container div,
        .dynamic-ui-container p,
        .dynamic-ui-container label,
        .dynamic-ui-container li,
        .dynamic-ui-container strong,
        .dynamic-ui-container em,
        .dynamic-ui-container small {
          color: var(--fg-primary) !important;
        }

        /* Muted text */
        .dynamic-ui-container small,
        .dynamic-ui-container .muted,
        .dynamic-ui-container [class*="muted"],
        .dynamic-ui-container [class*="secondary"] {
          color: var(--fg-muted) !important;
        }

        .dynamic-ui-container input,
        .dynamic-ui-container textarea,
        .dynamic-ui-container select {
          background: var(--bg-hover) !important;
          color: var(--fg-primary) !important;
          border: 1px solid var(--border-secondary) !important;
          border-radius: 8px !important;
          padding: 10px 14px !important;
          font-size: 14px !important;
          outline: none !important;
        }

        .dynamic-ui-container input:focus,
        .dynamic-ui-container textarea:focus,
        .dynamic-ui-container select:focus {
          border-color: var(--fg-accent) !important;
        }

        .dynamic-ui-container input::placeholder,
        .dynamic-ui-container textarea::placeholder {
          color: var(--fg-muted) !important;
        }

        .dynamic-ui-container button {
          background: var(--bg-hover) !important;
          color: var(--fg-primary) !important;
          border: 1px solid var(--border-secondary) !important;
          border-radius: 8px !important;
          padding: 10px 20px !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
        }

        .dynamic-ui-container button:hover {
          background: var(--bg-active) !important;
          border-color: var(--fg-muted) !important;
        }

        .dynamic-ui-container button:disabled {
          background: var(--bg-hover) !important;
          color: var(--fg-muted) !important;
          cursor: not-allowed !important;
          opacity: 0.6 !important;
        }

        /* Primary/Submit buttons */
        .dynamic-ui-container button[type="submit"],
        .dynamic-ui-container button.primary,
        .dynamic-ui-container button[class*="primary"] {
          background: var(--bg-accent) !important;
          color: white !important;
          border: none !important;
        }

        .dynamic-ui-container button[type="submit"]:hover,
        .dynamic-ui-container button.primary:hover {
          background: var(--bg-accent-hover) !important;
        }

        /* Radio and checkbox styling - fix blue focus ring */
        .dynamic-ui-container input[type="radio"],
        .dynamic-ui-container input[type="checkbox"] {
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          padding: 0 !important;
          accent-color: var(--fg-muted) !important;
          background: var(--bg-hover) !important;
          border: 2px solid var(--border-secondary) !important;
          outline: none !important;
          box-shadow: none !important;
        }

        .dynamic-ui-container input[type="radio"]:focus,
        .dynamic-ui-container input[type="checkbox"]:focus {
          outline: none !important;
          box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--fg-muted) !important;
        }

        .dynamic-ui-container input[type="radio"]:checked,
        .dynamic-ui-container input[type="checkbox"]:checked {
          accent-color: var(--fg-muted) !important;
          background: var(--fg-muted) !important;
        }

        /* Remove all blue focus outlines */
        .dynamic-ui-container *:focus {
          outline: none !important;
          box-shadow: none !important;
        }

        .dynamic-ui-container *:focus-visible {
          outline: 2px solid var(--fg-muted) !important;
          outline-offset: 2px !important;
        }

        /* Labels for radio/checkbox options */
        .dynamic-ui-container label {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 12px 16px !important;
          background: var(--bg-secondary) !important;
          border: 1px solid var(--border-secondary) !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
          color: var(--fg-primary) !important;
        }

        .dynamic-ui-container label:hover {
          background: var(--bg-hover) !important;
          border-color: var(--fg-muted) !important;
        }

        /* Selected state for labels - use accent color */
        .dynamic-ui-container label:has(input:checked) {
          background: var(--bg-accent) !important;
          border-color: var(--bg-accent) !important;
          color: white !important;
        }

        .dynamic-ui-container label:has(input:checked) span,
        .dynamic-ui-container label:has(input:checked) * {
          color: white !important;
        }

        .dynamic-ui-container label:has(input:checked):hover {
          background: var(--bg-accent-hover) !important;
          border-color: var(--bg-accent-hover) !important;
        }

        /* Progress bars */
        .dynamic-ui-container progress {
          appearance: none !important;
          height: 8px !important;
          border-radius: 4px !important;
          background: var(--bg-hover) !important;
          width: 100% !important;
        }

        .dynamic-ui-container progress::-webkit-progress-bar {
          background: var(--bg-hover) !important;
          border-radius: 4px !important;
        }

        .dynamic-ui-container progress::-webkit-progress-value {
          background: var(--fg-accent) !important;
          border-radius: 4px !important;
        }

        /* HR/Dividers - fix white lines */
        .dynamic-ui-container hr {
          border: none !important;
          border-top: 1px solid var(--border-secondary) !important;
          margin: 16px 0 !important;
          background: transparent !important;
        }

        /* Override any white/bright borders */
        .dynamic-ui-container [style*="border"],
        .dynamic-ui-container * {
          border-color: var(--border-secondary) !important;
        }

        /* Links */
        .dynamic-ui-container a {
          color: var(--fg-accent) !important;
          text-decoration: none !important;
        }

        .dynamic-ui-container a:hover {
          text-decoration: underline !important;
        }

        /* Headings */
        .dynamic-ui-container h1,
        .dynamic-ui-container h2,
        .dynamic-ui-container h3,
        .dynamic-ui-container h4,
        .dynamic-ui-container h5,
        .dynamic-ui-container h6 {
          color: var(--fg-primary) !important;
          margin-top: 0 !important;
          margin-bottom: 8px !important;
        }

        /* Paragraphs and text */
        .dynamic-ui-container p {
          color: var(--fg-secondary) !important;
          margin: 8px 0 !important;
        }

        /* Lists */
        .dynamic-ui-container ul,
        .dynamic-ui-container ol {
          color: var(--fg-primary) !important;
          padding-left: 20px !important;
        }

        .dynamic-ui-container li {
          color: var(--fg-primary) !important;
          margin: 4px 0 !important;
        }

        /* Tabs styling - prevent expansion from checkmarks */
        .dynamic-ui-container [role="tablist"],
        .dynamic-ui-container nav {
          display: flex !important;
          gap: 4px !important;
          background: transparent !important;
          border-bottom: 1px solid var(--border-secondary) !important;
          padding-bottom: 0 !important;
          margin-bottom: 16px !important;
          max-width: 100% !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          flex-wrap: nowrap !important;
        }

        .dynamic-ui-container [role="tab"],
        .dynamic-ui-container nav button,
        .dynamic-ui-container nav a {
          background: var(--bg-hover) !important;
          color: var(--fg-secondary) !important;
          border: none !important;
          border-radius: 8px 8px 0 0 !important;
          padding: 8px 16px !important;
          margin-bottom: -1px !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
          min-width: 0 !important;
        }

        .dynamic-ui-container [role="tab"][aria-selected="true"],
        .dynamic-ui-container [role="tab"]:focus,
        .dynamic-ui-container nav button.active,
        .dynamic-ui-container nav a.active {
          background: var(--bg-active) !important;
          color: var(--fg-primary) !important;
        }

        /* Tables */
        .dynamic-ui-container table {
          width: 100% !important;
          border-collapse: collapse !important;
          background: transparent !important;
        }

        .dynamic-ui-container th,
        .dynamic-ui-container td {
          padding: 10px 12px !important;
          border: 1px solid var(--border-secondary) !important;
          text-align: left !important;
          background: transparent !important;
        }

        .dynamic-ui-container th {
          background: var(--bg-hover) !important;
          color: var(--fg-primary) !important;
          font-weight: 600 !important;
        }

        .dynamic-ui-container td {
          color: var(--fg-secondary) !important;
        }

        .dynamic-ui-container tr:hover td {
          background: var(--bg-hover) !important;
        }

        /* Code blocks */
        .dynamic-ui-container pre,
        .dynamic-ui-container code {
          background: var(--bg-secondary) !important;
          color: var(--fg-primary) !important;
          border-radius: 6px !important;
          padding: 2px 6px !important;
          font-family: monospace !important;
        }

        .dynamic-ui-container pre {
          padding: 12px !important;
          overflow-x: auto !important;
        }

        .dynamic-ui-container pre code {
          padding: 0 !important;
          background: transparent !important;
        }

        /* Cards/Panels */
        .dynamic-ui-container [class*="card"],
        .dynamic-ui-container [class*="panel"],
        .dynamic-ui-container [class*="box"] {
          background: var(--bg-secondary) !important;
          border: 1px solid var(--border-secondary) !important;
          border-radius: 8px !important;
        }

        /* Alerts/Notices */
        .dynamic-ui-container [class*="alert"],
        .dynamic-ui-container [class*="notice"],
        .dynamic-ui-container [class*="warning"] {
          background: var(--bg-hover) !important;
          border-left: 3px solid var(--fg-accent) !important;
          padding: 12px !important;
          border-radius: 0 8px 8px 0 !important;
        }

        /* Badges/Tags */
        .dynamic-ui-container [class*="badge"],
        .dynamic-ui-container [class*="tag"],
        .dynamic-ui-container [class*="chip"] {
          background: var(--bg-hover) !important;
          color: var(--fg-primary) !important;
          padding: 4px 8px !important;
          border-radius: 4px !important;
          font-size: 12px !important;
        }
      `}</style>
      <DynamicUIRenderer {...rendererProps} />
    </div>
  );
}
