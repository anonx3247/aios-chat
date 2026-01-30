/**
 * Settings Persistence
 *
 * Frontend wrappers for tracking which tool-triggered settings forms
 * have been submitted, so they stay permanently closed after submission.
 */

import { invoke } from "@tauri-apps/api/core";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const LOCAL_STORAGE_KEY = "settings_submissions";

function getLocalSubmissions(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw !== null ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function setLocalSubmission(toolCallId: string): void {
  const set = getLocalSubmissions();
  set.add(toolCallId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...set]));
}

export async function markSettingsSubmitted(toolCallId: string, settingsKey: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke("mark_settings_submitted", { toolCallId, settingsKey });
      return;
    } catch {
      // Fall through to localStorage
    }
  }
  setLocalSubmission(toolCallId);
}

export async function isSettingsSubmitted(toolCallId: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<boolean>("is_settings_submitted", { toolCallId });
    } catch {
      // Fall through to localStorage
    }
  }
  return getLocalSubmissions().has(toolCallId);
}
