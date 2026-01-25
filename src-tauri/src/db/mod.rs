pub mod messages;
mod schema;
pub mod threads;

use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::Result;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub use messages::{Message, NewMessage};
pub use threads::Thread;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self> {
        let conn = Connection::open(path)?;
        schema::init(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("Database mutex poisoned")
    }
}

pub fn get_db(app: &AppHandle) -> &Database {
    app.state::<Database>().inner()
}
