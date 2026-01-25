use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub title: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub fn create_thread(conn: &Connection) -> Result<Thread> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let now_str = now.to_rfc3339();

    conn.execute(
        "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?1, NULL, ?2, ?3)",
        params![id, now_str, now_str],
    )?;

    Ok(Thread {
        id,
        title: None,
        created_at: now,
        updated_at: now,
    })
}

#[allow(dead_code)]
pub fn get_thread(conn: &Connection, id: &str) -> Result<Option<Thread>> {
    let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM threads WHERE id = ?1")?;

    let thread = stmt.query_row(params![id], |row| {
        Ok(Thread {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get::<_, String>(2)?.parse().unwrap_or_else(|_| Utc::now()),
            updated_at: row.get::<_, String>(3)?.parse().unwrap_or_else(|_| Utc::now()),
        })
    });

    match thread {
        Ok(t) => Ok(Some(t)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn list_threads(conn: &Connection) -> Result<Vec<Thread>> {
    let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC")?;

    let threads = stmt
        .query_map([], |row| {
            Ok(Thread {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get::<_, String>(2)?.parse().unwrap_or_else(|_| Utc::now()),
                updated_at: row.get::<_, String>(3)?.parse().unwrap_or_else(|_| Utc::now()),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(threads)
}

pub fn update_thread_title(conn: &Connection, id: &str, title: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE threads SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )?;
    Ok(())
}

pub fn update_thread_timestamp(conn: &Connection, id: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE threads SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn delete_thread(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM threads WHERE id = ?1", params![id])?;
    Ok(())
}
