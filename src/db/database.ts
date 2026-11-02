import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, FALLBACK } from "../domain/masterData";

export const SCHEMA_VERSION = 16;

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

-- Gifts (schema version 11; see domain/gifts.ts). Information only: not transactions, no category, no AI, no effect on any balance.
-- An occasion is created from the gift form the first time its name is typed; its date is the date of that first gift.
CREATE TABLE IF NOT EXISTS gift_occasions (
  id            TEXT PRIMARY KEY NOT NULL,
  title         TEXT NOT NULL,
  occasion_date TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One kind of gift per row. value is paise when unit is INR and milligrams when unit is g; rate_paise is the price of a gram that
-- day (gold and silver). No foreign key on occasion_id: the db layer keeps it valid.
CREATE TABLE IF NOT EXISTS gift_list (
  id          TEXT PRIMARY KEY NOT NULL,
  occasion_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('received', 'given')),
  type        TEXT NOT NULL CHECK (type IN ('cash', 'gold', 'silver', 'other')),
  value       INTEGER,
  unit        TEXT NOT NULL DEFAULT 'INR' CHECK (unit IN ('INR', 'g')),
  rate_paise  INTEGER,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS gift_list_occasion_idx ON gift_list (occasion_id);

-- Assets (schema version 12; see domain/assets.ts). Information only: not transactions, no AI, no effect on any balance. quantity is
-- in thousandths of unit (milligrams for gold). A gold row with a lender is pledged ("adagu"), the whole row; there is no pledge history.
-- gift_id is the gift a row was made from ("Add to assets" on a gold gift), so the same gift cannot be added twice.
CREATE TABLE IF NOT EXISTS assets (
  id             TEXT PRIMARY KEY NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('gold', 'land', 'mutual_fund', 'other')),
  name           TEXT NOT NULL,
  quantity       INTEGER,
  unit           TEXT CHECK (unit IS NULL OR unit IN ('g', 'units', 'cent', 'acre', 'sqft', 'ground')),
  purity_k       INTEGER,
  invested_paise INTEGER,
  acquired_date  TEXT,
  description    TEXT,
  gift_id        TEXT,
  lender         TEXT,
  ticket_no      TEXT,
  pledged_date   TEXT,
  due_date       TEXT,
  loan_paise     INTEGER,
  pledge_note    TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SOLD', 'DELETED')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS assets_gift_idx ON assets (gift_id);

-- Train journeys (schema version 13, reshaped in 14 and 15, cleaned up in 16; see domain/trainAlarms.ts). Information only, like gifts and assets: each row
-- is a journey date the owner wants alarms for. The booking is advance = 1 (60 days before, 8:00 AM) or tatkal = ac / non_ac (the day
-- before the journey, 10:00 / 11:00 AM); a journey has one of them. alarm_times is the owner's alarm times on the booking day, "HH:MM"
-- joined by commas ('' = the defaults for the booking). The alarms themselves live in iOS (AlarmKit and local notifications) and are
-- rebuilt from these rows by alarms/sync.ts.
-- (Version 13 had a 'rule' column for a 2-month option and version 14 a wake_lead_min column for a wake-up lead; version 16 drops both
-- from a database that still has them.)
CREATE TABLE IF NOT EXISTS train_journeys (
  id            TEXT PRIMARY KEY NOT NULL,
  label         TEXT NOT NULL,
  journey_date  TEXT NOT NULL,
  advance       INTEGER NOT NULL DEFAULT 1,
  tatkal        TEXT NOT NULL DEFAULT 'none' CHECK (tatkal IN ('none', 'ac', 'non_ac')),
  alarm_times   TEXT NOT NULL DEFAULT '',
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
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
    // Version 14 added Tatkal alarms to the train journeys table that version 13 created.
    const journeyColumns = await txn.getAllAsync<{ name: string }>("SELECT name FROM pragma_table_info('train_journeys')");
    if (!journeyColumns.some((c) => c.name === "advance")) {
      await txn.execAsync("ALTER TABLE train_journeys ADD COLUMN advance INTEGER NOT NULL DEFAULT 1");
    }
    if (!journeyColumns.some((c) => c.name === "tatkal")) {
      await txn.execAsync(
        "ALTER TABLE train_journeys ADD COLUMN tatkal TEXT NOT NULL DEFAULT 'none' CHECK (tatkal IN ('none', 'ac', 'non_ac'))",
      );
    }
    // Version 15 added the owner's own alarm times to each journey.
    if (!journeyColumns.some((c) => c.name === "alarm_times")) {
      await txn.execAsync("ALTER TABLE train_journeys ADD COLUMN alarm_times TEXT NOT NULL DEFAULT ''");
    }
    // Version 16 drops the train journey columns nothing reads any more: 'rule' (a 2-month option, version 13) and wake_lead_min (a
    // wake-up lead, version 14). A failed drop is ignored: an unused column is harmless, and the database must still open.
    for (const unused of ["rule", "wake_lead_min"]) {
      if (!journeyColumns.some((c) => c.name === unused)) continue;
      try {
        await txn.execAsync(`ALTER TABLE train_journeys DROP COLUMN ${unused}`);
      } catch {
        // left in place
      }
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
