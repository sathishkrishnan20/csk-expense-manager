import type { SQLiteDatabase } from "expo-sqlite";
import { deriveForAndItem } from "../domain/assets";
import { canGiveInExchange, type ExchangeFields } from "../domain/assetExchanges";
import { ASSET_COLUMNS_V18 } from "./schemaSql";

// The SQL of assets, For and Item, and exchanges, written against a tiny adapter so the same code runs on the phone (expo-sqlite) and in the tests
// (Node's SQLite, tests/db/assetSql.test.ts). Each function runs inside the caller's transaction.
export interface AssetDb {
  all<T>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
  first<T>(sql: string, params?: (string | number | null)[]): Promise<T | null>;
  run(sql: string, params?: (string | number | null)[]): Promise<void>;
}

export const fromSqlite = (db: SQLiteDatabase): AssetDb => ({
  all: (sql, params = []) => db.getAllAsync(sql, params),
  first: (sql, params = []) => db.getFirstAsync(sql, params),
  run: async (sql, params = []) => {
    await db.runAsync(sql, params);
  },
});

export type AssetOptionKind = "for" | "item";

// The spelling the For or Item list already has for this name (capitals do not matter), or the name added to the list as typed. Null for no name.
export async function canonicalOption(db: AssetDb, kind: AssetOptionKind, name: string | null): Promise<string | null> {
  const text = (name ?? "").trim().replace(/\s+/g, " ");
  if (text === "") return null;
  const found = await db.first<{ name: string }>("SELECT name FROM asset_options WHERE kind = ? AND LOWER(name) = LOWER(?) LIMIT 1", [kind, text]);
  if (found) return found.name;
  await db.run("INSERT INTO asset_options (kind, name, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM asset_options WHERE kind = ?))", [kind, text, kind]);
  return text;
}

// Schema version 18. An assets table made before it has neither For nor Item, so the columns are added, and every piece's old name is split once
// into the two (domain/assets.ts, deriveForAndItem), with the names that come out put in the dropdown lists. The old name column is not touched.
// Run again on a table that has the columns, it changes nothing.
export async function migrateAssetsV18(db: AssetDb): Promise<void> {
  const columns = await db.all<{ name: string }>("SELECT name FROM pragma_table_info('assets')");
  const split = !columns.some((c) => c.name === "item");
  for (const [column, sql] of ASSET_COLUMNS_V18) {
    if (!columns.some((c) => c.name === column)) await db.run(sql);
  }
  await db.run("CREATE INDEX IF NOT EXISTS assets_exchange_idx ON assets (exchange_id)");
  if (!split) return;

  const rows = await db.all<{ id: string; name: string }>("SELECT id, name FROM assets ORDER BY created_at, rowid");
  const derived = deriveForAndItem(rows.map((r) => r.name));
  let sort = 0;
  for (const [i, r] of rows.entries()) {
    const { forName, item } = derived[i];
    await db.run("UPDATE assets SET for_name = ?, item = ? WHERE id = ?", [forName, item, r.id]);
    for (const [kind, name] of [["for", forName], ["item", item]] as const) {
      if (name) await db.run("INSERT OR IGNORE INTO asset_options (kind, name, sort) VALUES (?, ?, ?)", [kind, name, sort++]);
    }
  }
}

// Records an exchange and takes the pieces given out of what is held, all or nothing (the caller's transaction rolls back if this throws). A piece
// that is not there, is not gold, is not held any more or is pledged is refused, naming it.
export async function giveInExchange(db: AssetDb, id: string, fields: ExchangeFields, givenIds: readonly string[]): Promise<void> {
  for (const pieceId of givenIds) {
    const piece = await db.first<{ name: string; type: "gold" | "land" | "mutual_fund" | "other"; status: "ACTIVE" | "SOLD" | "DELETED"; lender: string | null }>(
      "SELECT name, type, status, lender FROM assets WHERE id = ? AND status != 'DELETED'",
      [pieceId],
    );
    if (!piece) throw new Error("One of the pieces is not there any more.");
    if (piece.status === "DELETED" || !canGiveInExchange({ type: piece.type, status: piece.status, lender: piece.lender })) {
      throw new Error(`${piece.name} cannot be given: only gold that you hold and have not pledged can.`);
    }
  }
  await db.run("INSERT INTO asset_exchanges (id, exchange_date, shop, extra_paise, note) VALUES (?, ?, ?, ?, ?)", [id, fields.exchangeDate, fields.shop, fields.extraPaise, fields.note]);
  for (const pieceId of givenIds) {
    await db.run("UPDATE assets SET status = 'SOLD', exchange_id = ?, updated_at = datetime('now') WHERE id = ?", [id, pieceId]);
  }
}

// Undoes an exchange: the pieces given are held again, the pieces bought stay (as ordinary assets, no longer linked), and the record is removed.
export async function undoExchangeSql(db: AssetDb, id: string): Promise<void> {
  await db.run("UPDATE assets SET status = 'ACTIVE', exchange_id = NULL, updated_at = datetime('now') WHERE exchange_id = ? AND status = 'SOLD'", [id]);
  await db.run("UPDATE assets SET exchange_id = NULL, updated_at = datetime('now') WHERE exchange_id = ?", [id]);
  await db.run("UPDATE asset_exchanges SET status = 'DELETED', updated_at = datetime('now') WHERE id = ?", [id]);
}
