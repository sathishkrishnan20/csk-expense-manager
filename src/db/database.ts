import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, FALLBACK } from "../domain/masterData";

export const SCHEMA_VERSION = 10;

const SCHEMA = `
-- A group is a separate ledger (see domain/groups.ts). 'main' holds everything entered before groups existed.
CREATE TABLE IF NOT EXISTS expense_groups (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL,
  start_date TEXT,
  end_date   TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'DELETED')),
  -- the group this one sits under (a group's balance includes the groups under it); null = kept separate, and for Main
  parent_id  TEXT,
  -- shown first on Home
  pinned     INTEGER NOT NULL DEFAULT 0,
  -- income the group was started with out of money its parent already has (see domain/groups.ts, heldPaise)
  held_paise INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category    TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  sort        INTEGER NOT NULL,
  -- optional note on what belongs in the subcategory, sent to the AI with its name
  description TEXT,
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
  -- how many times the AI answered "could not place it" (see domain/classificationOutcome.ts)
  ai_attempts    INTEGER NOT NULL DEFAULT 0,
  -- which group the row belongs to; no foreign key, the db layer keeps it valid
  group_id       TEXT NOT NULL DEFAULT 'main',
  -- the group this entry was used to create ("Create a group for this entry"), if any
  created_group_id TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (txn_date DESC, created_at DESC);
`;

// Runs the work in one transaction. Native uses an exclusive transaction; the web build of
// expo-sqlite does not have those, and its plain transaction runs on the same connection.
export async function inTransaction(
  db: SQLite.SQLiteDatabase,
  work: (txn: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> {
  if (Platform.OS === "web") await db.withTransactionAsync(() => work(db));
  else await db.withExclusiveTransactionAsync(work);
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open();
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("expenses.db");
  if (Platform.OS !== "web") await db.execAsync("PRAGMA journal_mode = WAL;");

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
  await inTransaction(db, async (txn) => {
    const columns = await txn.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('transactions')");
    const isV1 = columns.length > 0 && !columns.some((c) => c.name === "id");
    if (isV1) await txn.execAsync("ALTER TABLE transactions RENAME TO transactions_v1");

    await txn.execAsync(SCHEMA);

    // Version 3 added ai_attempts; a table created by an older version does not have it yet.
    const now = await txn.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('transactions')");
    if (!now.some((c) => c.name === "ai_attempts")) {
      await txn.execAsync("ALTER TABLE transactions ADD COLUMN ai_attempts INTEGER NOT NULL DEFAULT 0");
    }

    // Version 4 added groups. Existing rows become Main through the column default. The index is created
    // only now, after the column exists, because SCHEMA also runs on databases that do not have it yet.
    if (!now.some((c) => c.name === "group_id")) {
      await txn.execAsync("ALTER TABLE transactions ADD COLUMN group_id TEXT NOT NULL DEFAULT 'main'");
    }
    // Version 5 remembers which entry created which group (used by Duplicate).
    if (!now.some((c) => c.name === "created_group_id")) {
      await txn.execAsync("ALTER TABLE transactions ADD COLUMN created_group_id TEXT");
    }
    // Version 7 stored the AI's suggestions on the row; version 8 keeps them in memory instead (import/suggestionStore.ts)
    // and drops the columns.
    for (const column of ["suggested_category", "suggested_subcategory", "suggestion_rejected"]) {
      if (now.some((c) => c.name === column)) await txn.execAsync(`ALTER TABLE transactions DROP COLUMN ${column}`);
    }
    // Version 9 added groups inside groups and pinning. Groups that already exist stay separate (no parent), so Main's
    // balance does not change until the owner puts a group under another one.
    const groupColumns = await txn.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('expense_groups')");
    if (!groupColumns.some((c) => c.name === "parent_id")) {
      await txn.execAsync("ALTER TABLE expense_groups ADD COLUMN parent_id TEXT");
    }
    if (!groupColumns.some((c) => c.name === "pinned")) {
      await txn.execAsync("ALTER TABLE expense_groups ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
    }
    // Version 10 added heldPaise: a group made from an income entry keeps that income to spend without the parent counting it twice.
    // Groups made that way before it get their held amount from the entry that created them.
    if (!groupColumns.some((c) => c.name === "held_paise")) {
      await txn.execAsync("ALTER TABLE expense_groups ADD COLUMN held_paise INTEGER NOT NULL DEFAULT 0");
      await txn.execAsync(
        `UPDATE expense_groups SET held_paise = COALESCE((
           SELECT t.amount_paise FROM transactions t
           WHERE t.created_group_id = expense_groups.id AND t.direction = 'credit' AND t.status = 'ACTIVE' LIMIT 1), 0)
         WHERE id != 'main'`,
      );
    }
    // Version 6 added a description per subcategory.
    const catColumns = await txn.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('categories')");
    if (!catColumns.some((c) => c.name === "description")) {
      await txn.execAsync("ALTER TABLE categories ADD COLUMN description TEXT");
    }
    await txn.execAsync(
      "CREATE INDEX IF NOT EXISTS transactions_group_idx ON transactions (group_id, txn_date DESC, created_at DESC)",
    );
    await txn.runAsync("INSERT OR IGNORE INTO expense_groups (id, name) VALUES ('main', 'Main')");

    const seeded = await txn.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM categories");
    if (!seeded?.n) {
      let sort = 0;
      for (const c of DEFAULT_CATEGORIES) {
        for (const sub of c.subcategories) {
          await txn.runAsync("INSERT INTO categories (category, subcategory, sort, description) VALUES (?, ?, ?, ?)", [
            c.category,
            sub,
            sort++,
            c.descriptions?.[sub] ?? null,
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
               'Others', 'Uncategorised',
               payee, CASE WHEN upi_ref IS NOT NULL THEN 'UPI' END, note, narration, vpa, note,
               payee_bank, upi_ref, 'migrated', imported_at, imported_at
        FROM transactions_v1;
        DROP TABLE transactions_v1;
      `);
    }

    await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
