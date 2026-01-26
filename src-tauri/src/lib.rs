mod commands;
mod db;

use std::fs;

use db::Database;
use tauri::menu::{MenuBuilder, SubmenuBuilder};
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

            // Note: Node backend runs separately during development.
            // For production, add sidecar spawning here.
            // See: src-tauri/sidecars/node-backend/

            // Create a custom menu with standard text editing shortcuts (Cmd+A, Cmd+C, etc.)
            // but without shortcuts that conflict with our app (the default Edit menu has Cmd+F for Find)
            #[cfg(target_os = "macos")]
            {
                let app_submenu = SubmenuBuilder::new(app, "AIOS Chat")
                    .about(None)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;

                // Add Edit menu with standard text editing shortcuts
                let edit_submenu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_submenu)
                    .item(&edit_submenu)
                    .build()?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::threads::create_thread,
            commands::threads::list_threads,
            commands::threads::delete_thread,
            commands::threads::update_thread_title,
            commands::messages::save_message,
            commands::messages::get_messages,
            commands::messages::delete_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
