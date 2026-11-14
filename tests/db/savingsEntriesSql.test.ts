import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { casBuys, placeFundEntries, waitingBuys } from "../../src/db/savingsEntriesSql";
import { applyMfCas, applySipPurchases, type SqlDb } from "../../src/db/savingsSql";
import { MONTH_TEMPLATE_SQL, SAVINGS_SQL, transactionsTableSql } from "../../src/db/schemaSql";
import type { SipPurchase } from "../../src/domain/fundMail";
import type { MfCas } from "../../src/domain/mfCas";
import type { FundBuy } from "../../src/domain/savingsEntries";

const adapter = (db: DatabaseSync): SqlDb => ({
  all: async <T>(sql: string, params: (string | number | null)[] = []) => db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[],
  first: async <T>(sql: string, params: (string | number | null)[] = []) => {
    const row = db.prepare(sql).get(...params);
    return (row ? { ...row } : null) as T | null;
  },
  run: async (sql, params = []) => {
    db.prepare(sql).run(...params);
  },
});

// The savings tables, the transactions table, a November 2026 group under Main with its day to day subgroup, and a record that November's set-up marked the group for mutual funds.
function fresh(): { db: SqlDb; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(SAVINGS_SQL);
  raw.exec(MONTH_TEMPLATE_SQL);
  raw.exec(transactionsTableSql("transactions", false));
  raw.exec("CREATE TABLE expense_groups (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', parent_id TEXT)");
  raw.exec("INSERT INTO expense_groups (id, name, start_date, end_date, parent_id) VALUES ('main', 'Main', NULL, NULL, NULL)");
  addGroup(raw, "g-nov", "November 2026 - Savings and Expenses", "2026-11-01", "2026-11-30", "main");
  addGroup(raw, "g-sub", "November 2026 Month Expenses", "2026-11-01", "2026-11-30", "g-nov");
  markFunds(raw, "2026-11", "g-nov");
  return { db: adapter(raw), raw };
}

function markFunds(raw: DatabaseSync, month: string, groupId: string, funds = 1): void {
  raw.prepare("INSERT INTO month_setups (month, template_group_id, group_id, funds_here) VALUES (?, ?, ?, ?)").run(month, `t-${groupId}`, groupId, funds);
}

function addGroup(raw: DatabaseSync, id: string, name: string, start: string, end: string, parent: string): void {
  raw.prepare("INSERT INTO expense_groups (id, name, start_date, end_date, parent_id) VALUES (?, ?, ?, ?, ?)").run(id, name, start, end, parent);
}

// This month is November 2026. A CAS only corrects entries (add: false).
const NOV = { month: "2026-11", add: true };
const CAS = { month: "2026-11", add: false };

const buy = (over: Partial<FundBuy> = {}): FundBuy => ({ isin: "INF000A01001", date: "2026-11-05", amountPaise: 600000, name: "Alpha ELSS Fund - Regular Growth", ...over });
const entries = (raw: DatabaseSync) => raw.prepare("SELECT * FROM transactions ORDER BY rowid").all().map((r) => ({ ...r })) as Record<string, string | number | null>[];

test("a purchase becomes a debit in the month group, not in Main or the day to day subgroup", async () => {
  const { db, raw } = fresh();
  const result = await placeFundEntries(db, [buy()], NOV);
  assert.deepEqual([result.added, result.same], [1, 0]);
  const [row] = entries(raw);
  assert.deepEqual(
    [row.group_id, row.direction, row.amount_paise, row.txn_date, row.category, row.subcategory, row.payee, row.source, row.status, row.classified_by],
    ["g-nov", "debit", 600000, "2026-11-05", "Savings", "Mutual Fund", "Alpha ELSS Fund", "manual", "ACTIVE", "savings"],
  );
  assert.match(String(row.dedupe_key), /^sip\|INF000A01001\|2026-11-05\|600000\|1$/);
});

test("placing the same purchase again, from an email and then from the CAS, adds nothing", async () => {
  const { db, raw } = fresh();
  await placeFundEntries(db, [buy()], NOV);
  const again = await placeFundEntries(db, [buy()], NOV);
  assert.deepEqual([again.added, again.same], [0, 1]);
  const cas = await placeFundEntries(db, [buy({ amountPaise: 600030 })], CAS);
  assert.equal(entries(raw).length, 1);
  assert.deepEqual([cas.updated, cas.added], [1, 0], "the CAS's amount (a rupee off at most) replaces the email's");
  assert.equal(entries(raw)[0].amount_paise, 600030);
});

test("an entry the owner changed is left as they made it; one they deleted is not made again", async () => {
  const { db, raw } = fresh();
  await placeFundEntries(db, [buy(), buy({ isin: "INF000B01002", name: "Beta Fund" })], NOV);
  raw.exec("UPDATE transactions SET amount_paise = 600050, updated_at = '2099-01-01 00:00:00' WHERE payee = 'Alpha ELSS Fund'");
  raw.exec("UPDATE transactions SET status = 'DELETED' WHERE payee = 'Beta Fund'");
  const again = await placeFundEntries(db, [buy({ amountPaise: 600000 }), buy({ isin: "INF000B01002", name: "Beta Fund" })], NOV);
  assert.deepEqual([again.added, again.updated], [0, 0]);
  assert.equal(entries(raw).length, 2);
  assert.equal(entries(raw)[0].amount_paise, 600050);
  assert.equal(entries(raw)[1].status, "DELETED");
});

test("two identical purchases make two entries, and doing it again keeps two", async () => {
  const { db, raw } = fresh();
  await placeFundEntries(db, [buy(), buy()], NOV);
  assert.equal(entries(raw).length, 2);
  assert.notEqual(entries(raw)[0].dedupe_key, entries(raw)[1].dedupe_key);
  await placeFundEntries(db, [buy(), buy()], NOV);
  assert.equal(entries(raw).length, 2);
});

test("with the month not set up, nothing is made; once it is set up the next pass adds it", async () => {
  const { db, raw } = fresh();
  const DEC = { month: "2026-12", add: true };
  const none = await placeFundEntries(db, [buy({ date: "2026-12-05" })], DEC);
  assert.deepEqual([none.added, none.noGroup], [0, 1]);
  assert.equal(entries(raw).length, 0);
  addGroup(raw, "g-dec", "December 2026 - Savings and Expenses", "2026-12-01", "2026-12-31", "main");
  markFunds(raw, "2026-12", "g-dec");
  const later = await placeFundEntries(db, [buy({ date: "2026-12-05" })], DEC);
  assert.equal(later.added, 1);
  assert.equal(entries(raw)[0].group_id, "g-dec");
});

test("a month whose set-up marked no group for mutual funds gets no entry", async () => {
  const { db, raw } = fresh();
  raw.exec("UPDATE month_setups SET funds_here = 0");
  const result = await placeFundEntries(db, [buy()], NOV);
  assert.deepEqual([result.added, result.noGroup], [0, 1]);
  assert.equal(entries(raw).length, 0);
});

test("a group the owner deleted receives nothing", async () => {
  const { db, raw } = fresh();
  raw.exec("UPDATE expense_groups SET status = 'DELETED' WHERE id = 'g-nov'");
  const result = await placeFundEntries(db, [buy()], NOV);
  assert.deepEqual([result.added, result.noGroup], [0, 1]);
  assert.equal(entries(raw).length, 0);
});

test("a purchase in a month that was not set up from the template is not put anywhere", async () => {
  const { db } = fresh();
  const result = await placeFundEntries(db, [buy({ date: "2026-10-30" })], { month: "2026-10", add: true });
  assert.deepEqual([result.added, result.noGroup], [0, 1]);
});

// ---- from the savings tables ------------------------------------------------------------------------------------------------------------------

const cas = (over: Partial<MfCas> = {}): MfCas => ({
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  valuationDate: "2026-10-31",
  holdings: [{ isin: "INF000A01001", folio: "111/1", name: "Alpha ELSS Fund - Regular Growth", unitsE4: 2000000, navE4: 1000000, investedPaise: 1800000, valuePaise: 2000000 }],
  purchases: [{ date: "2026-10-05", isin: "INF000A01001", amountPaise: 600000 }],
  ...over,
});
const sip = (over: Partial<SipPurchase> = {}): SipPurchase => ({ isin: "INF000A01001", folio: "111", name: null, date: "2026-11-05", unitsE4: 606510, netPaise: 599970, stampPaise: 30, navE4: 989220, ...over });

test("a purchase an email told about is placed with the fund's name, and the CAS that later covers it adds no second entry", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  await applySipPurchases(db, [sip()], "Purchase email");
  const first = await placeFundEntries(db, await waitingBuys(db), NOV);
  assert.equal(first.added, 1);
  assert.equal(entries(raw)[0].payee, "Alpha ELSS Fund");
  assert.equal(entries(raw)[0].amount_paise, 600000, "net amount + stamp duty");

  const december = cas({ periodStart: "2026-11-01", periodEnd: "2026-11-30", valuationDate: "2026-11-30", purchases: [{ date: "2026-11-05", isin: "INF000A01001", amountPaise: 600000 }] });
  await applyMfCas(db, december);
  const second = await placeFundEntries(db, casBuys(december), CAS);
  assert.deepEqual([second.added, second.same], [0, 1]);
  assert.equal(entries(raw).length, 1);
  assert.equal((await waitingBuys(db)).length, 0, "the CAS dropped the email's purchase");
});

test("a CAS never adds an entry, however recent the purchase; it only corrects one that is there", async () => {
  const { db, raw } = fresh();
  const statement = cas({ periodStart: "2026-10-01", periodEnd: "2026-11-30", valuationDate: "2026-11-30", purchases: [{ date: "2026-10-05", isin: "INF000A01001", amountPaise: 600000 }, { date: "2026-11-05", isin: "INF000A01001", amountPaise: 600000 }] });
  await applyMfCas(db, statement);
  const result = await placeFundEntries(db, casBuys(statement), CAS);
  assert.deepEqual([result.added, result.older], [0, 2]);
  assert.equal(entries(raw).length, 0);
});

test("a purchase from an earlier month than this one is skipped, even from an email", async () => {
  const { db, raw } = fresh();
  const result = await placeFundEntries(db, [buy({ date: "2026-10-05" }), buy({ date: "2026-11-05" })], NOV);
  assert.deepEqual([result.added, result.older], [1, 1]);
  assert.equal(entries(raw)[0].txn_date, "2026-11-05");
});
