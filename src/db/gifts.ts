import type { SQLiteDatabase } from "expo-sqlite";
import {
  normaliseTitle,
  occasionKey,
  type GiftDirection,
  type GiftFields,
  type GiftType,
  type GiftUnit,
} from "../domain/gifts";
import { getDb, inTransaction } from "./database";

// Gifts are information only: nothing here reads or writes transactions, groups or balances (see domain/gifts.ts).

export interface GiftRecord extends GiftFields {
  id: string;
  occasionId: string;
  occasionTitle: string;
  occasionDate: string;
  name: string;
  direction: GiftDirection;
  createdAt: string;
}

export interface OccasionSummary {
  id: string;
  title: string;
  date: string;
  count: number; // active gifts in it
  lastDirection: GiftDirection; // the direction of the gift added last, which the form starts with
}

interface GiftRow {
  id: string;
  occasion_id: string;
  occasion_title: string;
  occasion_date: string;
  name: string;
  direction: GiftDirection;
  type: GiftType;
  value: number | null;
  unit: GiftUnit;
  rate_paise: number | null;
  note: string | null;
  created_at: string;
}

const toRecord = (r: GiftRow): GiftRecord => ({
  id: r.id,
  occasionId: r.occasion_id,
  occasionTitle: r.occasion_title,
  occasionDate: r.occasion_date,
  name: r.name,
  direction: r.direction,
  type: r.type,
  value: r.value,
  unit: r.unit,
  ratePaise: r.rate_paise,
  note: r.note,
  createdAt: r.created_at,
});

const SELECT_GIFTS = `
  SELECT g.id, g.occasion_id, o.title AS occasion_title, o.occasion_date, g.name, g.direction, g.type, g.value, g.unit,
         g.rate_paise, g.note, g.created_at
  FROM gift_list g JOIN gift_occasions o ON o.id = g.occasion_id
  WHERE g.status = 'ACTIVE' AND o.status = 'ACTIVE'`;

const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Newest occasion first; inside an occasion, in the order the gifts were entered (like the notebook).
export async function listGifts(): Promise<GiftRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GiftRow>(`${SELECT_GIFTS} ORDER BY o.occasion_date DESC, o.created_at DESC, o.id, g.created_at, g.rowid`);
  return rows.map(toRecord);
}

export async function getGift(id: string): Promise<GiftRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GiftRow>(`${SELECT_GIFTS} AND g.id = ?`, [id]);
  return row ? toRecord(row) : null;
}

// The occasions that have at least one gift, newest first: the choices of the occasion field and the filter. An occasion whose
// gifts were all deleted is not listed.
export async function listOccasions(): Promise<OccasionSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; title: string; occasion_date: string; n: number; last_direction: GiftDirection }>(
    `SELECT o.id, o.title, o.occasion_date, COUNT(g.id) AS n,
            (SELECT direction FROM gift_list WHERE occasion_id = o.id AND status = 'ACTIVE' ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_direction
     FROM gift_occasions o JOIN gift_list g ON g.occasion_id = o.id AND g.status = 'ACTIVE'
     WHERE o.status = 'ACTIVE'
     GROUP BY o.id
     ORDER BY o.occasion_date DESC, o.created_at DESC`,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, date: r.occasion_date, count: r.n, lastDirection: r.last_direction }));
}

// The occasion with this name (ignoring case and spacing), or a new one. A new occasion takes the date of its first gift; an
// existing one keeps its own date, unless every gift in it was deleted, in which case this is its first gift again.
async function resolveOccasion(db: SQLiteDatabase, title: string, date: string): Promise<{ id: string; created: boolean }> {
  const key = occasionKey(title);
  const rows = await db.getAllAsync<{ id: string; title: string; n: number }>(
    `SELECT o.id, o.title,
            (SELECT COUNT(*) FROM gift_list g WHERE g.occasion_id = o.id AND g.status = 'ACTIVE') AS n
     FROM gift_occasions o WHERE o.status = 'ACTIVE'`,
  );
  const hit = rows.find((r) => occasionKey(r.title) === key);
  if (hit) {
    if (hit.n === 0) await setOccasionDate(db, hit.id, date);
    return { id: hit.id, created: false };
  }
  const id = newId("go");
  await db.runAsync("INSERT INTO gift_occasions (id, title, occasion_date) VALUES (?, ?, ?)", [id, normaliseTitle(title), date]);
  return { id, created: true };
}

async function setOccasionDate(db: SQLiteDatabase, id: string, date: string): Promise<void> {
  await db.runAsync("UPDATE gift_occasions SET occasion_date = ?, updated_at = datetime('now') WHERE id = ?", [date, id]);
}

export interface GiftInput extends GiftFields {
  name: string;
  direction: GiftDirection;
  occasionId: string | null; // an existing occasion, or null to use occasionTitle (an existing one with that name, else a new one)
  occasionTitle: string;
  occasionDate: string; // the date of a new occasion
  changeOccasionDate: boolean; // an existing occasion's date is changed to occasionDate (for every gift in it)
}

// Adds a gift, or updates one when `id` is given. Returns the occasion it ended up in.
export async function saveGift(input: GiftInput, id?: string): Promise<string> {
  const db = await getDb();
  let occasionId = "";
  await inTransaction(db, async (txn) => {
    if (input.occasionId) {
      occasionId = input.occasionId;
      if (input.changeOccasionDate) await setOccasionDate(txn, occasionId, input.occasionDate);
    } else {
      occasionId = (await resolveOccasion(txn, input.occasionTitle, input.occasionDate)).id;
    }
    const values = [
      occasionId,
      input.name.trim(),
      input.direction,
      input.type,
      input.value,
      input.unit,
      input.ratePaise,
      input.note?.trim() || null,
    ];
    if (id) {
      await txn.runAsync(
        `UPDATE gift_list SET occasion_id = ?, name = ?, direction = ?, type = ?, value = ?, unit = ?, rate_paise = ?, note = ?,
                updated_at = datetime('now') WHERE id = ?`,
        [...values, id],
      );
    } else {
      await txn.runAsync(
        "INSERT INTO gift_list (id, occasion_id, name, direction, type, value, unit, rate_paise, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [newId("gf"), ...values],
      );
    }
  });
  return occasionId;
}

// Soft delete, like transactions. An occasion left with no gifts simply stops being listed.
export async function deleteGift(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE gift_list SET status = 'DELETED', updated_at = datetime('now') WHERE id = ?", [id]);
}

export interface ImportedOccasion {
  title: string;
  date: string; // used when the occasion is new
  direction: GiftDirection;
  gifts: (GiftFields & { name: string })[];
}

// Saves a pasted list in one go. A title that matches an occasion already here adds to it and leaves its date alone.
export async function importGifts(list: readonly ImportedOccasion[]): Promise<{ gifts: number; occasions: number }> {
  const db = await getDb();
  const result = { gifts: 0, occasions: 0 };
  await inTransaction(db, async (txn) => {
    for (const o of list) {
      if (o.gifts.length === 0) continue;
      const { id, created } = await resolveOccasion(txn, o.title, o.date);
      if (created) result.occasions++;
      for (const g of o.gifts) {
        await txn.runAsync(
          "INSERT INTO gift_list (id, occasion_id, name, direction, type, value, unit, rate_paise, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [newId("gf"), id, g.name.trim(), o.direction, g.type, g.value, g.unit, g.ratePaise, g.note?.trim() || null],
        );
        result.gifts++;
      }
    }
  });
  return result;
}
