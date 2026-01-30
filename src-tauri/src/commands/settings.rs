use tauri::AppHandle;

use crate::db;

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn mark_settings_submitted(
    app: AppHandle,
    tool_call_id: String,
    settings_key: String,
) -> Result<(), String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    conn.execute(
        "INSERT OR REPLACE INTO settings_submissions (tool_call_id, settings_key, submitted_at) VALUES (?1, ?2, datetime('now'))",
        rusqlite::params![tool_call_id, settings_key],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn is_settings_submitted(
    app: AppHandle,
    tool_call_id: String,
) -> Result<bool, String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM settings_submissions WHERE tool_call_id = ?1",
            rusqlite::params![tool_call_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}
