use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_invocations: Option<Vec<Value>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_invocations: Option<Vec<Value>>,
}

pub fn save_message(conn: &Connection, thread_id: &str, message: &NewMessage) -> Result<Message> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let now_str = now.to_rfc3339();

    // Serialize tool_invocations to JSON string if present
    let tool_invocations_json: Option<String> = message
        .tool_invocations
        .as_ref()
        .map(|ti| serde_json::to_string(ti).unwrap_or_default());

    conn.execute(
        "INSERT INTO messages (id, thread_id, role, content, tool_invocations, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, thread_id, message.role, message.content, tool_invocations_json, now_str],
    )?;

    // Update thread timestamp
    super::threads::update_thread_timestamp(conn, thread_id)?;

    Ok(Message {
        id,
        thread_id: thread_id.to_string(),
        role: message.role.clone(),
        content: message.content.clone(),
        tool_invocations: message.tool_invocations.clone(),
        created_at: now,
    })
}

pub fn get_messages(conn: &Connection, thread_id: &str) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, role, content, tool_invocations, created_at FROM messages WHERE thread_id = ?1 ORDER BY created_at ASC",
    )?;

    let messages = stmt
        .query_map(params![thread_id], |row| {
            let tool_invocations_json: Option<String> = row.get(4)?;
            let tool_invocations: Option<Vec<Value>> = tool_invocations_json
                .and_then(|json| serde_json::from_str(&json).ok());

            Ok(Message {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                tool_invocations,
                created_at: row.get::<_, String>(5)?.parse().unwrap_or_else(|_| Utc::now()),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(messages)
}

pub fn delete_message(conn: &Connection, message_id: &str) -> Result<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![message_id])?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_messages_by_thread(conn: &Connection, thread_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM messages WHERE thread_id = ?1",
        params![thread_id],
    )?;
    Ok(())
}
