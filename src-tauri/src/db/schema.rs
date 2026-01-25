use anyhow::Result;
use rusqlite::Connection;

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r"
        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
        ",
    )?;

    // Enable foreign key constraints
    conn.execute("PRAGMA foreign_keys = ON", [])?;

    // Migration: add tool_invocations column if it doesn't exist
    // SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we check first
    let has_tool_invocations: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('messages') WHERE name='tool_invocations'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|count| count > 0)
        .unwrap_or(false);

    if !has_tool_invocations {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN tool_invocations TEXT",
            [],
        )?;
    }

    Ok(())
}
