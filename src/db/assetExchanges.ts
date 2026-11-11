import type { ExchangeFields } from "../domain/assetExchanges";
import { fromSqlite, giveInExchange, undoExchangeSql } from "./assetSql";
import { listAssets, type AssetRecord } from "./assets";
import { getDb, inTransaction } from "./database";

// Exchanges with a shop: old gold given back, new gold bought (see domain/assetExchanges.ts). The pieces given have status SOLD and the
// exchange's id; the pieces bought are ordinary assets with the same id (added afterwards through the asset form).

export interface ExchangeRecord extends ExchangeFields {
  id: string;
  createdAt: string;
  given: AssetRecord[]; // the pieces handed to the shop
  bought: AssetRecord[]; // the pieces bought in its place
}

interface ExchangeRow {
  id: string;
  exchange_date: string;
  shop: string | null;
  extra_paise: number | null;
  note: string | null;
  created_at: string;
}

const SELECT_EXCHANGES = "SELECT id, exchange_date, shop, extra_paise, note, created_at FROM asset_exchanges WHERE status = 'ACTIVE'";

const newId = (): string => `ax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function toRecord(r: ExchangeRow, assets: readonly AssetRecord[]): ExchangeRecord {
  const mine = assets.filter((a) => a.exchangeId === r.id);
  return {
    id: r.id,
    exchangeDate: r.exchange_date,
    shop: r.shop,
    extraPaise: r.extra_paise,
    note: r.note,
    createdAt: r.created_at,
    given: mine.filter((a) => a.status === "SOLD"),
    bought: mine.filter((a) => a.status === "ACTIVE"),
  };
}

// Newest first.
export async function listExchanges(): Promise<ExchangeRecord[]> {
  const db = await getDb();
  const [rows, assets] = await Promise.all([
    db.getAllAsync<ExchangeRow>(`${SELECT_EXCHANGES} ORDER BY exchange_date DESC, created_at DESC, rowid DESC`),
    listAssets(),
  ]);
  return rows.map((r) => toRecord(r, assets));
}

export async function getExchange(id: string): Promise<ExchangeRecord | null> {
  const db = await getDb();
  const [row, assets] = await Promise.all([db.getFirstAsync<ExchangeRow>(`${SELECT_EXCHANGES} AND id = ?`, [id]), listAssets()]);
  return row ? toRecord(row, assets) : null;
}

// Records the exchange and takes the pieces given out of what is held, all or nothing. A piece that is not gold, is not held any more or is
// pledged is refused with its name, and then nothing is changed (db/assetSql.ts).
export async function createExchange(fields: ExchangeFields, givenIds: readonly string[]): Promise<string> {
  const db = await getDb();
  const id = newId();
  await inTransaction(db, (txn) => giveInExchange(fromSqlite(txn), id, fields, givenIds));
  return id;
}

// Undoes an exchange: the pieces given are held again, the pieces bought stay (as ordinary assets, no longer linked), and the record is removed.
export async function undoExchange(id: string): Promise<void> {
  const db = await getDb();
  await inTransaction(db, (txn) => undoExchangeSql(fromSqlite(txn), id));
}
