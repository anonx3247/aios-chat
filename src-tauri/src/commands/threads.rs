use tauri::AppHandle;

use crate::db::{self, Thread};

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn create_thread(app: AppHandle) -> Result<Thread, String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::threads::create_thread(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn list_threads(app: AppHandle) -> Result<Vec<Thread>, String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::threads::list_threads(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn delete_thread(app: AppHandle, id: String) -> Result<(), String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::threads::delete_thread(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn update_thread_title(app: AppHandle, id: String, title: String) -> Result<(), String> {
    let db = db::get_db(&app);
    let conn = db.conn();
    db::threads::update_thread_title(&conn, &id, &title).map_err(|e| e.to_string())
}
