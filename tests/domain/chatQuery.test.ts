import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { transactionsTableSql } from "../../src/db/schemaSql";
import {
  buildEntriesQuery,
  buildMatchCountQuery,
  buildTotalsQuery,
  expenseWhere,
  likePattern,
  type ExpenseFilter,
  type SqlFragment,
} from "../../src/domain/chatQuery";

// A real SQLite with the real transactions table, so the statements are run, not only read.
function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(transactionsTableSql("transactions", true));
  const insert = db.prepare(
    `INSERT INTO transactions (id, source, txn_date, direction, amount_paise, category, subcategory, payee, payment_method, description, note, status, classified_by, group_id, created_at)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, '2026-11-01 00:00:00')`,
  );
  const row = (id: string, date: string, dir: string, paise: number, cat: string, sub: string, payee: string | null, via: string | null, description: string | null, note: string | null, status = "ACTIVE", group = "main") =>
    insert.run(id, date, dir, paise, cat, sub, payee, via, description, note, status, group);
  row("1", "2026-10-03", "debit", 7000, "Food & Groceries", "Snacks", "KARTHIKA K", "UPI", "bakery snacks", "bakery sna");
  row("2", "2026-10-20", "debit", 1000, "Food & Groceries", "Snacks", "ANIL", "UPI", null, "pay to bha");
  row("3", "2026-10-21", "debit", 6000, "Food & Groceries", "Chaats", "KARTHIKA K", "UPI", "Gopi Manchurian", null);
  row("4", "2026-11-02", "debit", 3500, "Food & Groceries", "Chaats", "Kaveri condimen", "UPI", "Panipuri", "panipuri");
  row("5", "2026-11-03", "debit", 250000, "Home office", "Gadgets", "Apple", null, "100% cotton_cover", null);
  row("6", "2026-11-03", "credit", 5000000, "Income", "Salary", "Blend", "Cash", "Oct salary", null);
  row("7", "2026-11-03", "debit", 99900, "Food & Groceries", "Snacks", "ZZ", null, "deleted one", null, "DELETED");
  row("9", "2026-09-15", "debit", 15000, "Food & Groceries", "Snacks", "Hot Chipts", null, null, null); // typed by hand: the text is in the payee
  row("10", "2026-09-16", "debit", 500, "Food & Groceries", "Snacks", null, null, null, null);
  row("8", "2026-10-25", "debit", 4000, "Food & Groceries", "Snacks", "OTHER GROUP", null, "chips", null, "ACTIVE", "g-trip");
  return db;
}

const MAIN: SqlFragment = { sql: "AND group_id IN (?)", params: ["main"] };
const BOTH: SqlFragment = { sql: "AND group_id IN (?,?)", params: ["main", "g-trip"] };
const OCT: ExpenseFilter = { type: "spent", from: "2026-10-01", to: "2026-10-31" };

// node:sqlite gives rows without a prototype; copy them so they compare with plain objects
const run = (db: DatabaseSync, q: { sql: string; params: (string | number)[] }) =>
  db.prepare(q.sql).all(...q.params).map((r) => ({ ...r })) as Record<string, unknown>[];

test("a total is exact, and limited to the groups, the dates, the direction and the active entries", () => {
  const db = database();
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, OCT, "none", 10)), [{ total: 14000, n: 3 }]); // not the other group's, not November's
  assert.deepEqual(run(db, buildTotalsQuery(BOTH, OCT, "none", 10)), [{ total: 18000, n: 4 }]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...OCT, from: "2026-11-01", to: "2026-11-30", type: "received" }, "none", 10)), [{ total: 5000000, n: 1 }]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...OCT, from: "2026-11-01", to: "2026-11-30" }, "none", 10)), [{ total: 253500, n: 2 }]); // the deleted one is not counted
});

test("filters by category, subcategory and payee, ignoring capitals", () => {
  const db = database();
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...OCT, category: "food & groceries", subcategory: "SNACKS" }, "none", 10)), [{ total: 8000, n: 2 }]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...OCT, payee: "karthika" }, "none", 10)), [{ total: 13000, n: 2 }]);
});

test("words are looked for in the description, the UPI note and the payee, any of them matching", () => {
  const db = database();
  const wide: ExpenseFilter = { ...OCT, to: "2026-11-30" };
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["panipuri"] }, "none", 10)), [{ total: 3500, n: 1 }]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["gopi", "bha"] }, "none", 10)), [{ total: 7000, n: 2 }]); // description, and note
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["kaveri"] }, "none", 10)), [{ total: 3500, n: 1 }]); // payee
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["nothing like this"] }, "none", 10)), [{ total: 0, n: 0 }]);
});

test("a word cannot act as a LIKE wildcard or break out of the statement", () => {
  const db = database();
  const wide: ExpenseFilter = { ...OCT, to: "2026-11-30" };
  assert.equal(likePattern("100%_x\\"), "%100\\%\\_x\\\\%");
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["100%"] }, "none", 10)), [{ total: 250000, n: 1 }]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["%"] }, "none", 10)), [{ total: 250000, n: 1 }]); // only the entry that has a real %
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, textContains: ["_"] }, "none", 10)), [{ total: 250000, n: 1 }]);
  const evil = { ...wide, category: "x'; DROP TABLE transactions; --", textContains: ["'); DELETE FROM transactions; --"] };
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, evil, "none", 10)), [{ total: 0, n: 0 }]);
  assert.equal((run(db, { sql: "SELECT COUNT(*) AS n FROM transactions", params: [] })[0] as { n: number }).n, 10);
});

test("a breakdown has a row per group, largest first, months in date order, and says when there are more rows", () => {
  const db = database();
  const wide: ExpenseFilter = { ...OCT, to: "2026-11-30" };
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, wide, "subcategory", 10)), [
    { label: "Home office : Gadgets", total: 250000, n: 1 },
    { label: "Food & Groceries : Chaats", total: 9500, n: 2 },
    { label: "Food & Groceries : Snacks", total: 8000, n: 2 },
  ]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, wide, "month", 10)).map((r) => r.label), ["2026-10", "2026-11"]);
  assert.equal(run(db, buildTotalsQuery(MAIN, wide, "category", 1)).length, 2); // one more than asked: the caller sees there are more
  // what was written: the description, else the note, else nothing
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, category: "Food & Groceries" }, "description", 10)).map((r) => r.label), [
    "bakery snacks",
    "gopi manchurian",
    "panipuri",
    "pay to bha",
  ]);
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, { ...wide, subcategory: "Gadgets" }, "payment_method", 10)), [{ label: "Not set", total: 250000, n: 1 }]);
});

test("what was written falls back from the description to the note to the payee, since an entry typed by hand keeps its text in the payee", () => {
  const db = database();
  const sept: ExpenseFilter = { type: "spent", from: "2026-09-01", to: "2026-09-30" };
  assert.deepEqual(run(db, buildTotalsQuery(MAIN, sept, "description", 10)), [
    { label: "hot chipts", total: 15000, n: 1 },
    { label: "(no text)", total: 500, n: 1 },
  ]);
});

test("entries come newest or largest first, never with the bank text, and the match count is the whole count", () => {
  const db = database();
  const wide: ExpenseFilter = { ...OCT, to: "2026-11-30" };
  const newest = run(db, buildEntriesQuery(MAIN, wide, "newest", 2));
  assert.deepEqual(newest.map((r) => r.txn_date), ["2026-11-03", "2026-11-02"]);
  const largest = run(db, buildEntriesQuery(MAIN, wide, "largest", 1));
  assert.equal(largest[0].amount_paise, 250000);
  assert.ok(!("narration" in newest[0]) && !("vpa" in newest[0]) && !("balance_paise" in newest[0]) && !("dedupe_key" in newest[0]));
  assert.deepEqual(run(db, buildMatchCountQuery(MAIN, wide)), [{ n: 5 }]);
});

test("the conditions are built from the fields only, with the values as parameters", () => {
  const f = expenseWhere({ ...OCT, type: "both", category: "A'B", textContains: ["x", " "] });
  assert.ok(!f.sql.includes("A'B") && !f.sql.includes("direction"));
  assert.deepEqual(f.params, ["2026-10-01", "2026-10-31", "A'B", "%x%", "%x%", "%x%"]); // the blank word is dropped
});
