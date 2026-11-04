import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { REBUILD_TRANSACTIONS, needsTransactionsRebuild, transactionsTableSql } from "../../src/db/schemaSql";

// The transactions table as it was before schema version 17: the source could only be 'import' or 'manual'.
const OLD_TABLE = transactionsTableSql("transactions", true)
  .replace("CONSTRAINT source_check CHECK (source IN ('import', 'manual', 'sms'))", "CHECK (source IN ('import', 'manual'))") // unnamed, as it was
  .replace("CONSTRAINT status_check ", "")
  .replace("CONSTRAINT direction_check ", "");

function oldDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_TABLE);
  db.exec("CREATE INDEX transactions_date_idx ON transactions (txn_date DESC, created_at DESC)");
  const insert = db.prepare(
    `INSERT INTO transactions (id, dedupe_key, source, txn_date, direction, amount_paise, balance_paise, category, subcategory, payee, classified_by, group_id, created_at)
     VALUES (?, ?, ?, ?, 'debit', ?, ?, 'Food', 'Groceries', ?, 'manual', ?, ?)`,
  );
  insert.run("a", "upi:111111111111:D", "import", "2026-11-01", 69700, 1518465, "SATHISH KR", "main", "2026-11-01 08:00:00");
  insert.run("b", "upi:222222222222:D", "import", "2026-11-01", 3500, null, "Dikki Poori", "g-trip", "2026-11-01 09:00:00");
  insert.run("c", null, "manual", "2026-11-01", 15000, null, "Hot Chipts", "main", "2026-11-01 10:00:00");
  return db;
}

test("the old table refuses the new source, and a table made now allows it", () => {
  const old = oldDatabase();
  assert.ok(needsTransactionsRebuild((old.prepare("SELECT sql FROM sqlite_master WHERE name = 'transactions'").get() as { sql: string }).sql));
  assert.throws(() => old.exec("INSERT INTO transactions (id, source, txn_date, direction, amount_paise, category, subcategory, classified_by) VALUES ('x', 'sms', '2026-11-03', 'debit', 1, 'a', 'b', 'c')"));

  const fresh = new DatabaseSync(":memory:");
  fresh.exec(transactionsTableSql("transactions", true));
  assert.ok(!needsTransactionsRebuild((fresh.prepare("SELECT sql FROM sqlite_master WHERE name = 'transactions'").get() as { sql: string }).sql));
  assert.ok(!needsTransactionsRebuild(null));
});

test("rebuilding keeps every row exactly as it was, in the same order, and then allows the new source", () => {
  const db = oldDatabase();
  const before = db.prepare("SELECT * FROM transactions ORDER BY rowid").all();

  db.exec(REBUILD_TRANSACTIONS);

  const after = db.prepare("SELECT * FROM transactions ORDER BY rowid").all();
  assert.deepEqual(after, before); // every column of every row, including source, group, created_at and the order
  assert.deepEqual(after.map((r) => r.source), ["import", "import", "manual"]); // no existing entry's source is touched

  db.exec("INSERT INTO transactions (id, dedupe_key, source, txn_date, direction, amount_paise, category, subcategory, classified_by) VALUES ('d', 'upi:667321247083:D', 'sms', '2026-11-03', 'debit', 11500, 'Food', 'Groceries', 'x')");
  assert.equal((db.prepare("SELECT source FROM transactions WHERE id = 'd'").get() as { source: string }).source, "sms");
  assert.throws(() => db.exec("INSERT INTO transactions (id, source, txn_date, direction, amount_paise, category, subcategory, classified_by) VALUES ('e', 'bogus', '2026-11-03', 'debit', 1, 'a', 'b', 'c')"));
});

test("after the rebuild the dedupe key is still unique, the indexes are back, and running it again is not needed", () => {
  const db = oldDatabase();
  db.exec(REBUILD_TRANSACTIONS);
  assert.throws(() => db.exec("INSERT INTO transactions (id, dedupe_key, source, txn_date, direction, amount_paise, category, subcategory, classified_by) VALUES ('z', 'upi:111111111111:D', 'import', '2026-11-03', 'debit', 1, 'a', 'b', 'c')"));
  assert.throws(() => db.exec("INSERT INTO transactions (id, source, txn_date, direction, amount_paise, category, subcategory, classified_by) VALUES ('a', 'manual', '2026-11-03', 'debit', 1, 'a', 'b', 'c')")); // primary key

  const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions' AND name LIKE 'transactions_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  assert.deepEqual(indexes, ["transactions_date_idx", "transactions_group_idx"]);
  assert.ok(!needsTransactionsRebuild((db.prepare("SELECT sql FROM sqlite_master WHERE name = 'transactions'").get() as { sql: string }).sql));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'transactions_rebuilt'").get() as { n: number }).n, 0);
});

// SQLite 3.53 can change a NAMED check in place; Node's own SQLite may be older, so this is skipped there.
test("the new table names all its checks, so a later widening is an ALTER and not a rebuild", (t) => {
  const db = new DatabaseSync(":memory:");
  const version = (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v.split(".").map(Number);
  if (version[0] < 3 || (version[0] === 3 && version[1] < 53)) return t.skip("needs SQLite 3.53");

  db.exec(transactionsTableSql("transactions", true));
  const row = (id: string, source: string) =>
    `INSERT INTO transactions (id, source, txn_date, direction, amount_paise, category, subcategory, classified_by) VALUES ('${id}', '${source}', '2026-11-03', 'debit', 1, 'a', 'b', 'c')`;
  assert.throws(() => db.exec(row("x", "future")));
  db.exec("ALTER TABLE transactions DROP CONSTRAINT source_check");
  db.exec("ALTER TABLE transactions ADD CONSTRAINT source_check CHECK (source IN ('import', 'manual', 'sms', 'future'))");
  db.exec(row("x", "future"));
  assert.throws(() => db.exec(row("y", "bogus")));
});

test("a table with the new source but unnamed checks (status, direction) is still rebuilt, and one with all three named is not", () => {
  const unnamed = transactionsTableSql("transactions", true).replace("CONSTRAINT status_check ", "").replace("CONSTRAINT direction_check ", "");
  assert.ok(needsTransactionsRebuild(unnamed));
  assert.ok(!needsTransactionsRebuild(transactionsTableSql("transactions", true)));
});
