/**
 * Secure Credential Storage
 *
 * Wrapper around Tauri IPC for OS-native credential storage.
 * Credentials are stored in:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service
 */
import { invoke } from "@tauri-apps/api/core";

/**
 * Valid credential keys
 */
export type CredentialKey =
  | "anthropic_api_key"
  | "perplexity_api_key"
  | "firecrawl_api_key"
  | "redpill_api_key"
  | "email_address"
  | "email_username"
  | "email_password"
  | "email_imap_host"
  | "email_imap_port"
  | "email_imap_security"
  | "email_smtp_host"
  | "email_smtp_port"
  | "email_smtp_security"
  | "email_ssl_verify";

/**
 * Get a credential from secure storage
 * @returns The credential value, or null if not set
 */
export async function getCredential(key: CredentialKey): Promise<string | null> {
  return invoke<string | null>("get_credential", { key });
}

/**
 * Set a credential in secure storage
 */
export async function setCredential(key: CredentialKey, value: string): Promise<void> {
  return invoke("set_credential", { key, value });
}

/**
 * Delete a credential from secure storage
 */
export async function deleteCredential(key: CredentialKey): Promise<void> {
  return invoke("delete_credential", { key });
}

/**
 * Get all stored credentials
 * @returns Map of credential key to value
 */
export async function getAllCredentials(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_all_credentials");
}

/**
 * Check if running in Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Fallback to localStorage when not in Tauri (e.g., web dev mode)
 * This is less secure but allows development without Tauri
 */
const localStoragePrefix = "__cred_";

export async function getCredentialWithFallback(key: CredentialKey): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      return await getCredential(key);
    } catch (e) {
      console.error("Failed to get credential from Tauri, falling back to localStorage:", e);
    }
  }
  return localStorage.getItem(`${localStoragePrefix}${key}`);
}

export async function setCredentialWithFallback(key: CredentialKey, value: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await setCredential(key, value);
      return;
    } catch (e) {
      console.error("Failed to set credential in Tauri, falling back to localStorage:", e);
    }
  }
  localStorage.setItem(`${localStoragePrefix}${key}`, value);
}

export async function deleteCredentialWithFallback(key: CredentialKey): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await deleteCredential(key);
      return;
    } catch (e) {
      console.error("Failed to delete credential from Tauri, falling back to localStorage:", e);
    }
  }
  localStorage.removeItem(`${localStoragePrefix}${key}`);
}

export async function getAllCredentialsWithFallback(): Promise<Record<string, string>> {
  if (isTauriEnvironment()) {
    try {
      return await getAllCredentials();
    } catch (e) {
      console.error("Failed to get all credentials from Tauri, falling back to localStorage:", e);
    }
  }
  // Fallback: gather from localStorage
  const keys: CredentialKey[] = [
    "anthropic_api_key",
    "perplexity_api_key",
    "firecrawl_api_key",
    "redpill_api_key",
    "email_address",
    "email_username",
    "email_password",
    "email_imap_host",
    "email_imap_port",
    "email_imap_security",
    "email_smtp_host",
    "email_smtp_port",
    "email_smtp_security",
    "email_ssl_verify",
  ];
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = localStorage.getItem(`${localStoragePrefix}${key}`);
    if (value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}
