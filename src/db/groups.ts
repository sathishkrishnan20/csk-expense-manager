import type { SQLiteDatabase } from "expo-sqlite";
import {
  MAIN_GROUP_ID,
  descendantIds,
  isMainGroup,
  validateParent,
  withRolledUp,
  type Group,
  type GroupStatus,
  type GroupWithBalance,
} from "../domain/groups";
import { getDb, inTransaction } from "./database";

interface GroupRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: GroupStatus;
  parent_id: string | null;
  pinned: number;
  held_paise: number;
  in_paise: number;
  out_paise: number;
}

export interface GroupInput {
  name: string;
  startDate: string | null;
  endDate: string | null;
  parentId: string | null; // the group it sits under; null keeps it separate (Main is never under anything)
  heldPaise?: number; // opening income taken from money the parent already has (a group made from an income entry)
}

const newGroupId = (): string => `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Main first, then open groups, then closed ones; newest start date first. Deleted groups are not listed. Each group's
// balance includes the groups under it (see domain/groups.ts).
export async function listGroupsWithBalances(): Promise<GroupWithBalance[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GroupRow>(
    `SELECT g.id, g.name, g.start_date, g.end_date, g.status, g.parent_id, g.pinned, g.held_paise,
            COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount_paise END), 0) AS in_paise,
            COALESCE(SUM(CASE WHEN t.direction = 'debit'  THEN t.amount_paise END), 0) AS out_paise
     FROM expense_groups g
     LEFT JOIN transactions t ON t.group_id = g.id AND t.status = 'ACTIVE'
     WHERE g.status != 'DELETED'
     GROUP BY g.id
     ORDER BY (g.id = 'main') DESC, g.status = 'CLOSED', COALESCE(g.start_date, g.created_at) DESC`,
  );
  return withRolledUp(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
      parentId: r.parent_id,
      pinned: r.pinned === 1,
      heldPaise: r.held_paise,
      inPaise: r.in_paise,
      outPaise: r.out_paise,
    })),
  );
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
  await db.runAsync("INSERT INTO expense_groups (id, name, start_date, end_date, parent_id, held_paise) VALUES (?, ?, ?, ?, ?, ?)", [
    id,
    input.name.trim(),
    input.startDate,
    input.endDate,
    input.parentId,
    input.heldPaise ?? 0,
  ]);
  return id;
}

// Main can be renamed but never gets dates or a parent. A group cannot be moved under itself or under one of its own
// subgroups.
export async function updateGroup(id: string, input: GroupInput): Promise<void> {
  const db = await getDb();
  const main = isMainGroup(id);
  if (!main) {
    const all = await listGroupsWithBalances();
    const problem = validateParent(all, id, input.parentId);
    if (problem) throw new Error(problem);
  }
  await db.runAsync(
    "UPDATE expense_groups SET name = ?, start_date = ?, end_date = ?, parent_id = ?, updated_at = datetime('now') WHERE id = ?",
    [input.name.trim(), main ? null : input.startDate, main ? null : input.endDate, main ? null : input.parentId, id],
  );
}

// Pinned groups come first in Home's strip. Main is always there, so it is never pinned.
export async function setGroupPinned(id: string, pinned: boolean): Promise<void> {
  if (isMainGroup(id)) return;
  const db = await getDb();
  await db.runAsync("UPDATE expense_groups SET pinned = ?, updated_at = datetime('now') WHERE id = ?", [pinned ? 1 : 0, id]);
}

// The group and every group below it, for closing and deleting them together.
async function subtreeIds(db: SQLiteDatabase, id: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string; parent_id: string | null }>(
    "SELECT id, parent_id FROM expense_groups WHERE status != 'DELETED'",
  );
  const links = rows.map((r) => ({ id: r.id, parentId: r.parent_id }));
  return [id, ...descendantIds(links, id)];
}

// How many groups sit below a group and how many entries the whole subtree holds (for the delete confirmation).
export async function subtreeCounts(id: string): Promise<{ subgroups: number; transactions: number }> {
  const db = await getDb();
  const ids = await subtreeIds(db, id);
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions WHERE status = 'ACTIVE' AND group_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  return { subgroups: ids.length - 1, transactions: row?.n ?? 0 };
}

// Closing hides a group from Home and the pickers; it can be reopened. The groups below it close and reopen with it. Main
// cannot be closed.
export async function setGroupClosed(id: string, closed: boolean): Promise<void> {
  if (id === MAIN_GROUP_ID) return;
  const db = await getDb();
  const ids = await subtreeIds(db, id);
  await db.runAsync(
    `UPDATE expense_groups SET status = ?, updated_at = datetime('now')
     WHERE status = ? AND id IN (${ids.map(() => "?").join(",")})`,
    [closed ? "CLOSED" : "ACTIVE", closed ? "ACTIVE" : "CLOSED", ...ids],
  );
}

// Soft delete of the group, the groups below it and all of their transactions (their bank keys stay, so deleted rows are
// not brought back by importing the statement again). Main cannot be deleted.
export async function deleteGroup(id: string): Promise<void> {
  if (id === MAIN_GROUP_ID) return;
  const db = await getDb();
  await inTransaction(db, async (txn) => {
    const ids = await subtreeIds(txn, id);
    const marks = ids.map(() => "?").join(",");
    await txn.runAsync(
      `UPDATE transactions SET status = 'DELETED', updated_at = datetime('now') WHERE group_id IN (${marks})`,
      ids,
    );
    await txn.runAsync(
      `UPDATE expense_groups SET status = 'DELETED', pinned = 0, updated_at = datetime('now') WHERE id IN (${marks})`,
      ids,
    );
  });
}

export type { Group };
