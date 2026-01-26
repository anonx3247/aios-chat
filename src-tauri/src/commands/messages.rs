use tauri::AppHandle;

use crate::db::{self, Message, NewMessage};

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn save_message(
    app: AppHandle,
    thread_id: String,
    message: NewMessage,
) -> Result<Message, String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::messages::save_message(&conn, &thread_id, &message).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn get_messages(app: AppHandle, thread_id: String) -> Result<Vec<Message>, String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::messages::get_messages(&conn, &thread_id).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn delete_message(app: AppHandle, message_id: String) -> Result<(), String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::messages::delete_message(&conn, &message_id).map_err(|e| e.to_string())
}
