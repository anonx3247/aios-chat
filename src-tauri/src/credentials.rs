//! Secure credential storage using OS keychain
//!
//! Uses the `keyring` crate to store sensitive data like API keys
//! in the operating system's native credential store:
//! - macOS: Keychain
//! - Windows: Credential Manager
//! - Linux: Secret Service (libsecret)

use std::collections::HashMap;

/// Service name for keyring - identifies our app's credentials
const SERVICE: &str = "com.aios.chat";

/// All known credential keys
const CREDENTIAL_KEYS: &[&str] = &[
    "anthropic_api_key",
    "perplexity_api_key",
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

/// Get a credential from the secure store
#[tauri::command]
pub fn get_credential(key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Set a credential in the secure store
#[tauri::command]
pub fn set_credential(key: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
    entry.set_password(value).map_err(|e| e.to_string())
}

/// Delete a credential from the secure store
#[tauri::command]
pub fn delete_credential(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already doesn't exist, that's fine
        Err(e) => Err(e.to_string()),
    }
}

/// Get all stored credentials
/// Returns a map of key -> value for all credentials that exist
#[tauri::command]
pub fn get_all_credentials() -> Result<HashMap<String, String>, String> {
    let mut credentials = HashMap::new();

    for key in CREDENTIAL_KEYS {
        if let Ok(Some(value)) = get_credential(key) {
            credentials.insert((*key).to_string(), value);
        }
    }

    Ok(credentials)
}
