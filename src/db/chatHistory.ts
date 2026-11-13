import { historyCutoff, type MessageRow } from "../domain/chatHistory";
import { fromSqlite } from "./assetSql";
import { deleteAllThreadsSql, deleteOldThreadsSql, deleteThreadSql, listThreadsSql, loadThreadSql, saveThreadSql, type ThreadSummary } from "./chatHistorySql";
import { getDb, inTransaction } from "./database";

// The history of Ask AI chats on this phone (domain/chatHistory.ts has the rules, chatHistorySql.ts the SQL).
export type { ThreadSummary };

export async function saveChatThread(id: string, title: string, groupId: string | null, rows: readonly MessageRow[]): Promise<void> {
  const db = await getDb();
  await inTransaction(db, (txn) => saveThreadSql(fromSqlite(txn), id, title, groupId, rows));
}

export async function listChatThreads(): Promise<ThreadSummary[]> {
  return listThreadsSql(fromSqlite(await getDb()));
}

export async function loadChatThread(id: string): Promise<{ groupId: string | null; rows: MessageRow[] } | null> {
  return loadThreadSql(fromSqlite(await getDb()), id);
}

export async function deleteChatThread(id: string): Promise<void> {
  const db = await getDb();
  await inTransaction(db, (txn) => deleteThreadSql(fromSqlite(txn), id));
}

export async function deleteAllChatThreads(): Promise<void> {
  const db = await getDb();
  await inTransaction(db, (txn) => deleteAllThreadsSql(fromSqlite(txn)));
}

// Run each time the app opens: removes the chats whose last message is more than 30 days old.
export async function cleanUpOldChats(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  let removed = 0;
  await inTransaction(db, async (txn) => {
    removed = await deleteOldThreadsSql(fromSqlite(txn), historyCutoff(now));
  });
  return removed;
}
