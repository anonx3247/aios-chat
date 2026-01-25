mod commands;
mod db;

use std::fs;

use db::Database;
use tauri::Manager;

/// # Panics
///
/// Panics if the Tauri application fails to initialize.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("chat.db");
            let database = Database::new(db_path)?;
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::threads::create_thread,
            commands::threads::list_threads,
            commands::threads::delete_thread,
            commands::threads::update_thread_title,
            commands::messages::save_message,
            commands::messages::get_messages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
