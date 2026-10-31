import type { SQLiteDatabase } from "expo-sqlite";
import { MAIN_GROUP_ID, isMainGroup, type Group, type GroupStatus, type GroupWithBalance } from "../domain/groups";
import { getDb, inTransaction } from "./database";

interface GroupRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: GroupStatus;
  in_paise: number;
  out_paise: number;
}

export interface GroupInput {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

const toGroup = (r: GroupRow): GroupWithBalance => ({
  id: r.id,
  name: r.name,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
  inPaise: r.in_paise,
  outPaise: r.out_paise,
});

const newGroupId = (): string => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Main first, then open groups, then closed ones; newest start date first. Deleted groups are not listed.
export async function listGroupsWithBalances(): Promise<GroupWithBalance[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GroupRow>(
    `SELECT g.id, g.name, g.start_date, g.end_date, g.status,
            COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount_paise END), 0) AS in_paise,
            COALESCE(SUM(CASE WHEN t.direction = 'debit'  THEN t.amount_paise END), 0) AS out_paise
     FROM expense_groups g
     LEFT JOIN transactions t ON t.group_id = g.id AND t.status = 'ACTIVE'
     WHERE g.status != 'DELETED'
     GROUP BY g.id
     ORDER BY (g.id = 'main') DESC, g.status = 'CLOSED', COALESCE(g.start_date, g.created_at) DESC`,
  );
  return rows.map(toGroup);
}

export async function getGroup(id: string): Promise<GroupWithBalance | null> {
  return (await listGroupsWithBalances()).find((g) => g.id === id) ?? null;
}

export async function createGroup(input: GroupInput): Promise<string> {
  return insertGroup(await getDb(), input);
}

// Also used inside a larger transaction (an entry that creates its group).
export async function insertGroup(db: SQLiteDatabase, input: GroupInput): Promise<string> {
  const id = newGroupId();
  await db.runAsync("INSERT INTO expense_groups (id, name, start_date, end_date) VALUES (?, ?, ?, ?)", [
    id,
    input.name.trim(),
    input.startDate,
    input.endDate,
  ]);
  return id;
}

// Main can be renamed but never gets dates.
export async function updateGroup(id: string, input: GroupInput): Promise<void> {
  const db = await getDb();
  const main = isMainGroup(id);
  await db.runAsync(
    "UPDATE expense_groups SET name = ?, start_date = ?, end_date = ?, updated_at = datetime('now') WHERE id = ?",
    [input.name.trim(), main ? null : input.startDate, main ? null : input.endDate, id],
  );
}

// Closing hides a group from Home and the pickers; it can be reopened. Main cannot be closed.
export async function setGroupClosed(id: string, closed: boolean): Promise<void> {
  if (id === MAIN_GROUP_ID) return;
  const db = await getDb();
  await db.runAsync("UPDATE expense_groups SET status = ?, updated_at = datetime('now') WHERE id = ?", [
    closed ? "CLOSED" : "ACTIVE",
    id,
  ]);
}

// Soft delete of the group and all of its transactions (their bank keys stay, so deleted rows are not
// brought back by importing the statement again). Main cannot be deleted.
export async function deleteGroup(id: string): Promise<void> {
  if (id === MAIN_GROUP_ID) return;
  const db = await getDb();
  await inTransaction(db, async (txn) => {
    await txn.runAsync("UPDATE transactions SET status = 'DELETED', updated_at = datetime('now') WHERE group_id = ?", [id]);
    await txn.runAsync("UPDATE expense_groups SET status = 'DELETED', updated_at = datetime('now') WHERE id = ?", [id]);
  });
}

export type { Group };
