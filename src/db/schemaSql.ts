// The SQL for the transactions table, in one place so the schema (db/database.ts) and the rebuild that widens its `source` check use the
// same definition. Pure strings: nothing here opens a database, so the tests can run it against Node's own SQLite.

// Schema version 17 added the source 'sms' (an entry made by the automatic bank SMS route). SQLite 3.53 (the version expo-sqlite bundles) can
// drop and add a NAMED CHECK in place (ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT), but the CHECK on `source` in a database made
// before version 17 has no name, so it cannot be dropped that way: those databases have the table rebuilt once (REBUILD_TRANSACTIONS)
// with every row copied as it is. The definition below names all three checks on this table (source_check, status_check,
// direction_check), so the next change to any of their allowed values is an ALTER, not another rebuild.
export const transactionsTableSql = (name: string, ifNotExists: boolean): string => `
CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${name} (
  id             TEXT PRIMARY KEY NOT NULL,
  dedupe_key     TEXT UNIQUE,
  source         TEXT NOT NULL CONSTRAINT source_check CHECK (source IN ('import', 'manual', 'sms')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT status_check CHECK (status IN ('ACTIVE', 'DELETED')),
  txn_date       TEXT NOT NULL,
  direction      TEXT NOT NULL CONSTRAINT direction_check CHECK (direction IN ('debit', 'credit')),
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
);`;

const COLUMNS = [
  "id", "dedupe_key", "source", "status", "txn_date", "direction", "amount_paise", "balance_paise", "category", "subcategory", "payee",
  "payment_method", "description", "narration", "vpa", "note", "payee_bank", "upi_ref", "classified_by", "ai_attempts", "group_id",
  "created_group_id", "created_at", "updated_at",
].join(", ");

// True when this table's CREATE statement (from sqlite_master) is from before version 17 and has to be rebuilt: it lacks the new source
// or has a check without a name.
export const needsTransactionsRebuild = (createSql: string | null | undefined): boolean =>
  !!createSql && !["source_check", "status_check", "direction_check"].every((name) => createSql.includes(`CONSTRAINT ${name} `));

// Copies in rowid order so entries keep their order within a day (the lists sort on rowid last). No value is changed.
export const REBUILD_TRANSACTIONS = `
${transactionsTableSql("transactions_rebuilt", false)}
INSERT INTO transactions_rebuilt (${COLUMNS}) SELECT ${COLUMNS} FROM transactions ORDER BY rowid;
DROP TABLE transactions;
ALTER TABLE transactions_rebuilt RENAME TO transactions;
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (txn_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_group_idx ON transactions (group_id, txn_date DESC, created_at DESC);
`;

// Schema version 18: Assets get a For and an Item, and exchanges with a shop (see domain/assets.ts and domain/assetExchanges.ts). Every CHECK is
// named, so a later change to the allowed values is an ALTER, not a rebuild (see AGENTS.md).
export const ASSET_OPTIONS_SQL = `
CREATE TABLE IF NOT EXISTS asset_options (
  kind TEXT NOT NULL CONSTRAINT asset_options_kind_check CHECK (kind IN ('for', 'item')),
  name TEXT NOT NULL,
  sort INTEGER NOT NULL,
  PRIMARY KEY (kind, name)
);
`;

export const ASSET_EXCHANGES_SQL = `
CREATE TABLE IF NOT EXISTS asset_exchanges (
  id            TEXT PRIMARY KEY NOT NULL,
  exchange_date TEXT NOT NULL,
  shop          TEXT,
  extra_paise   INTEGER,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT asset_exchanges_status_check CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// The columns version 18 adds to assets. The table's own unnamed CHECKs are left alone (nothing here changes what they allow).
export const ASSET_COLUMNS_V18 = [
  ["for_name", "ALTER TABLE assets ADD COLUMN for_name TEXT"],
  ["item", "ALTER TABLE assets ADD COLUMN item TEXT"],
  ["exchange_id", "ALTER TABLE assets ADD COLUMN exchange_id TEXT"],
] as const;

// The columns schema version 19 adds to train_journeys: the booked flag (every journey saved before it is not booked) and the optional PNR.
export const TRAIN_COLUMNS_V19 = [
  ["booked", "ALTER TABLE train_journeys ADD COLUMN booked INTEGER NOT NULL DEFAULT 0"],
  ["pnr", "ALTER TABLE train_journeys ADD COLUMN pnr TEXT"],
] as const;
