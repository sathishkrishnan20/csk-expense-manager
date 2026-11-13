import type { MessageRow } from "../domain/chatHistory";
import type { AssetDb as SqlDb } from "./assetSql";

// The SQL of the chat history (domain/chatHistory.ts), written against the same tiny adapter as assetSql.ts so it runs on the phone and, in
// tests/db/chatHistorySql.test.ts, on Node's SQLite. Every function that changes more than one table runs inside the caller's transaction.

export interface ThreadSummary {
  id: string;
  title: string;
  groupId: string | null;
  updatedAt: string; // SQLite UTC time, "yyyy-mm-dd hh:mm:ss"
  messages: number;
}

// Writes a chat: the thread (its title and group stay as first saved; the last-message time moves), and all its messages in place of the earlier copy.
export async function saveThreadSql(db: SqlDb, id: string, title: string, groupId: string | null, rows: readonly MessageRow[]): Promise<void> {
  await db.run(
    `INSERT INTO chat_threads (id, title, group_id) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now')`,
    [id, title, groupId],
  );
  await db.run("DELETE FROM chat_messages WHERE thread_id = ?", [id]);
  for (const r of rows) {
    await db.run(
      "INSERT INTO chat_messages (thread_id, seq, role, text, tools_used, proposal, proposal_state, card) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, r.seq, r.role, r.text, r.toolsUsed, r.proposal, r.proposalState, r.card],
    );
  }
}

// Newest chat first.
export async function listThreadsSql(db: SqlDb): Promise<ThreadSummary[]> {
  const rows = await db.all<{ id: string; title: string; group_id: string | null; updated_at: string; messages: number }>(
    `SELECT t.id, t.title, t.group_id, t.updated_at,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id) AS messages
     FROM chat_threads t ORDER BY t.updated_at DESC, t.rowid DESC`,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, groupId: r.group_id, updatedAt: r.updated_at, messages: r.messages }));
}

export async function loadThreadSql(db: SqlDb, id: string): Promise<{ groupId: string | null; rows: MessageRow[] } | null> {
  const thread = await db.first<{ group_id: string | null }>("SELECT group_id FROM chat_threads WHERE id = ?", [id]);
  if (!thread) return null;
  const rows = await db.all<{ seq: number; role: "user" | "assistant"; text: string; tools_used: string | null; proposal: string | null; proposal_state: "added" | "dismissed" | null; card: string | null }>(
    "SELECT seq, role, text, tools_used, proposal, proposal_state, card FROM chat_messages WHERE thread_id = ? ORDER BY seq",
    [id],
  );
  return {
    groupId: thread.group_id,
    rows: rows.map((r) => ({ seq: r.seq, role: r.role, text: r.text, toolsUsed: r.tools_used, proposal: r.proposal, proposalState: r.proposal_state, card: r.card })),
  };
}

export async function deleteThreadSql(db: SqlDb, id: string): Promise<void> {
  await db.run("DELETE FROM chat_messages WHERE thread_id = ?", [id]);
  await db.run("DELETE FROM chat_threads WHERE id = ?", [id]);
}

export async function deleteAllThreadsSql(db: SqlDb): Promise<void> {
  await db.run("DELETE FROM chat_messages");
  await db.run("DELETE FROM chat_threads");
}

// Removes every chat whose last message is before `cutoff` (domain/chatHistory.ts, historyCutoff), with its messages. Returns how many chats went.
export async function deleteOldThreadsSql(db: SqlDb, cutoff: string): Promise<number> {
  const old = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM chat_threads WHERE updated_at < ?", [cutoff]);
  await db.run("DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE updated_at < ?)", [cutoff]);
  await db.run("DELETE FROM chat_threads WHERE updated_at < ?", [cutoff]);
  // Messages whose chat is gone (nothing should leave any, this is a safety net).
  await db.run("DELETE FROM chat_messages WHERE thread_id NOT IN (SELECT id FROM chat_threads)");
  return old?.n ?? 0;
}
