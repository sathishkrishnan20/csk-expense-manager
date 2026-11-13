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

// Schema version 20: the history of Ask AI chats (domain/chatHistory.ts). A chat is a thread of messages kept on this phone only, and removed 30 days
// after its last message. Every CHECK is named (see AGENTS.md). `card` and `proposal` are JSON text; `tools_used` is the titles joined with a
// line break. A thread's messages are rewritten together each time it changes, so (thread_id, seq) is the key.
export const CHAT_HISTORY_SQL = `
CREATE TABLE IF NOT EXISTS chat_threads (
  id         TEXT PRIMARY KEY NOT NULL,
  title      TEXT NOT NULL,
  group_id   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_threads_updated_idx ON chat_threads (updated_at DESC);
CREATE TABLE IF NOT EXISTS chat_messages (
  thread_id      TEXT NOT NULL,
  seq            INTEGER NOT NULL,
  role           TEXT NOT NULL CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant')),
  text           TEXT NOT NULL,
  tools_used     TEXT,
  proposal       TEXT,
  proposal_state TEXT CONSTRAINT chat_messages_proposal_state_check CHECK (proposal_state IS NULL OR proposal_state IN ('added', 'dismissed')),
  card           TEXT,
  PRIMARY KEY (thread_id, seq)
);
`;

// Schema version 21: Savings (domain/savings.ts), for information only, like Assets. Every CHECK is named (see AGENTS.md).
//  - savings_months: one figure per kind (mf, nps, pf), account and month, from a statement or (PF only) an estimate. `own_paise` is the owner's own
//    money, `employer_paise` the employer's, `pension_paise` the PF pension share. A mutual fund month has account '' (a total across every fund).
//  - savings_accounts: a PF account (by member ID) or the NPS account (by PRAN): its balances or value as of the last statement, and for PF the
//    "add each month" switch and the usual monthly amounts.
//  - savings_holdings: the units of each fund (by ISIN, in a folio) or NPS scheme as the last statement printed them, with the statement's NAV and the
//    newest NAV looked up online (the live value is units x NAV). Units and NAVs are x 10,000.
export const SAVINGS_SQL = `
CREATE TABLE IF NOT EXISTS savings_months (
  kind          TEXT NOT NULL CONSTRAINT savings_months_kind_check CHECK (kind IN ('mf', 'nps', 'pf')),
  account       TEXT NOT NULL,
  month         TEXT NOT NULL,
  own_paise     INTEGER NOT NULL DEFAULT 0,
  employer_paise INTEGER NOT NULL DEFAULT 0,
  pension_paise INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL CONSTRAINT savings_months_source_check CHECK (source IN ('statement', 'estimate')),
  credited_date TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, account, month)
);
CREATE TABLE IF NOT EXISTS savings_accounts (
  kind           TEXT NOT NULL CONSTRAINT savings_accounts_kind_check CHECK (kind IN ('pf', 'nps')),
  account        TEXT NOT NULL,
  label          TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT savings_accounts_status_check CHECK (status IN ('ACTIVE', 'CLOSED')),
  as_of          TEXT,
  fy             INTEGER,
  value_paise    INTEGER,
  invested_paise INTEGER,
  xirr           TEXT,
  own_paise      INTEGER,
  employer_paise INTEGER,
  pension_paise  INTEGER,
  auto_add       INTEGER NOT NULL DEFAULT 0 CONSTRAINT savings_accounts_auto_add_check CHECK (auto_add IN (0, 1)),
  auto_from      TEXT,
  est_own_paise  INTEGER NOT NULL DEFAULT 0,
  est_employer_paise INTEGER NOT NULL DEFAULT 0,
  est_pension_paise INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, account)
);
CREATE TABLE IF NOT EXISTS savings_holdings (
  kind           TEXT NOT NULL CONSTRAINT savings_holdings_kind_check CHECK (kind IN ('mf', 'nps')),
  account        TEXT NOT NULL,
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  units_e4       INTEGER NOT NULL,
  nav_e4         INTEGER NOT NULL,
  value_paise    INTEGER NOT NULL,
  invested_paise INTEGER,
  as_of          TEXT NOT NULL,
  nav_date       TEXT,
  live_nav_e4    INTEGER,
  live_nav_date  TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, account, code)
);
-- Schema version 22: a purchase (a SIP instalment) read from a fund house's confirmation email, kept until the monthly CAS arrives and covers it. It has no rule on its values, so there is nothing to name.
-- units_e4 is units x 10,000. folio is the folio as the CAS prints it, so a row belongs to one savings_holdings row (isin + folio).
CREATE TABLE IF NOT EXISTS savings_purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  isin         TEXT NOT NULL,
  folio        TEXT NOT NULL,
  purchased_on TEXT NOT NULL,
  units_e4     INTEGER NOT NULL,
  net_paise    INTEGER NOT NULL,
  stamp_paise  INTEGER NOT NULL DEFAULT 0,
  nav_e4       INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS savings_purchases_fund_idx ON savings_purchases (isin, folio, purchased_on);
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
