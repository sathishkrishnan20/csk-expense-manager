import * as SQLite from "expo-sqlite";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, FALLBACK } from "../domain/masterData";

export const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  sort        INTEGER NOT NULL,
  UNIQUE (category, subcategory)
);

CREATE TABLE IF NOT EXISTS payment_methods (
  name TEXT PRIMARY KEY NOT NULL,
  sort INTEGER NOT NULL
);

-- amount_paise is always positive; direction says which way the money moved.
-- Deleting only sets status = 'DELETED' so a deleted bank row is not re-imported.
CREATE TABLE IF NOT EXISTS transactions (
  id             TEXT PRIMARY KEY NOT NULL,
  dedupe_key     TEXT UNIQUE,
  source         TEXT NOT NULL CHECK (source IN ('import', 'manual')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  txn_date       TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_paise   INTEGER NOT NULL,
  balance_paise  INTEGER,
  category       TEXT NOT NULL,
  subcategory    TEXT NOT NULL,
  payee          TEXT,
  payment_method TEXT,
  description    TEXT,
  narration      TEXT,
  vpa            TEXT,
  note           TEXT,
  payee_bank     TEXT,
  upi_ref        TEXT,
  classified_by  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (txn_date DESC, created_at DESC);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open();
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("expenses.db");
  await db.execAsync("PRAGMA journal_mode = WAL;");

  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if ((row?.user_version ?? 0) < SCHEMA_VERSION) await migrate(db);

  // The fallback category must always exist.
  await db.runAsync(
    `INSERT OR IGNORE INTO categories (category, subcategory, sort)
     VALUES (?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM categories))`,
    [FALLBACK.category, FALLBACK.subcategory],
  );
  return db;
}

// v1 (first release) kept one `transactions` table keyed by the bank's dedupe
// key with the old built-in categories. Those rows are carried over, labelled
// 'migrated' and set to the fallback so "Re-classify uncategorised" can
// categorise them against the user's own categories.
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const columns = await txn.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('transactions')");
    const isV1 = columns.length > 0 && !columns.some((c) => c.name === "id");
    if (isV1) await txn.execAsync("ALTER TABLE transactions RENAME TO transactions_v1");

    await txn.execAsync(SCHEMA);

    const seeded = await txn.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM categories");
    if (!seeded?.n) {
      let sort = 0;
      for (const c of DEFAULT_CATEGORIES) {
        for (const sub of c.subcategories) {
          await txn.runAsync("INSERT INTO categories (category, subcategory, sort) VALUES (?, ?, ?)", [
            c.category,
            sub,
            sort++,
          ]);
        }
      }
      sort = 0;
      for (const name of DEFAULT_PAYMENT_METHODS) {
        await txn.runAsync("INSERT INTO payment_methods (name, sort) VALUES (?, ?)", [name, sort++]);
      }
    }

    if (isV1) {
      await txn.execAsync(`
        INSERT INTO transactions
          (id, dedupe_key, source, status, txn_date, direction, amount_paise, balance_paise,
           category, subcategory, payee, payment_method, description, narration, vpa, note,
           payee_bank, upi_ref, classified_by, created_at, updated_at)
        SELECT dedupe_key, dedupe_key, 'import', 'ACTIVE', txn_date, direction, amount_paise, balance_paise,
               CASE direction WHEN 'credit' THEN 'Income' ELSE 'Others' END,
               CASE direction WHEN 'credit' THEN 'Others' ELSE 'Uncategorised' END,
               payee, CASE WHEN upi_ref IS NOT NULL THEN 'UPI' END, note, narration, vpa, note,
               payee_bank, upi_ref, 'migrated', imported_at, imported_at
        FROM transactions_v1;
        DROP TABLE transactions_v1;
      `);
    }

    await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
