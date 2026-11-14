import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { applySetup, deleteTemplateEntry, fundsGroupFor, loadSetUpMonths, loadTemplate, monthGroupExists, saveTemplateEntry, type EntryInput } from "../../src/db/monthTemplateSql";
import type { SqlDb } from "../../src/db/savingsSql";
import { DROP_TEMPLATE_V23_SQL, MONTH_TEMPLATE_SQL, needsTemplateRebuild, transactionsTableSql } from "../../src/db/schemaSql";
import { DEFAULT_CATEGORIES } from "../../src/domain/masterData";
import { TEMPLATE_MAIN, planSetup, type GroupFields } from "../../src/domain/monthTemplate";

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

function fresh(): { db: SqlDb; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(MONTH_TEMPLATE_SQL);
  raw.exec(transactionsTableSql("transactions", false));
  raw.exec("CREATE TABLE expense_groups (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', parent_id TEXT, held_paise INTEGER NOT NULL DEFAULT 0)");
  raw.exec("INSERT INTO expense_groups (id, name) VALUES ('main', 'Main')");
  return { db: adapter(raw), raw };
}

const entry = (groupId: string, over: Partial<EntryInput> = {}): EntryInput => ({
  groupId, direction: "debit", category: "Households", subcategory: "Rent", payee: "Rent", paymentMethod: null, description: null, amountPaise: 2400000, day: 1, ...over,
});
const grp = (over: Partial<GroupFields> = {}): GroupFields => ({ name: "{Month} {Year} - Savings", openingIncome: true, fundsHere: false, home: false, ...over });
const rows = (raw: DatabaseSync, sql: string) => raw.prepare(sql).all().map((r) => ({ ...r })) as Record<string, string | number | null>[];

// Salary in Main creates the month group; inside it, Rent, and Monthly Expenses which creates the day to day group.
async function twoLevels(db: SqlDb) {
  const salary = await saveTemplateEntry(db, entry(TEMPLATE_MAIN, { direction: "credit", category: "Income", subcategory: "Salary", payee: "Blend", amountPaise: null }), grp({ name: "{Month} {Year} - Savings and Expenses", fundsHere: true }));
  const top = (await loadTemplate(db)).lines.find((l) => l.id === salary)!.createsGroupId!;
  await saveTemplateEntry(db, entry(top), null);
  const budget = await saveTemplateEntry(db, entry(top, { category: "Expenses", subcategory: "Monthly Expenses", payee: "Monthly Expenses", amountPaise: 2500000, day: 3 }), grp({ name: "{Month} {Year} Month Expenses", home: true }));
  const sub = (await loadTemplate(db)).lines.find((l) => l.id === budget)!.createsGroupId!;
  return { salary, top, budget, sub };
}

test("an entry in Main and the group it creates are saved, read back and edited", async () => {
  const { db } = fresh();
  const { top, salary } = await twoLevels(db);
  const t = await loadTemplate(db);
  assert.deepEqual(t.groups.map((g) => [g.name, g.parentId === null ? "Main" : g.parentId === top ? "top" : "?", g.openingIncome, g.fundsHere, g.home]), [
    ["{Month} {Year} - Savings and Expenses", "Main", true, true, false],
    ["{Month} {Year} Month Expenses", "top", true, false, true],
  ]);
  assert.deepEqual(t.lines.filter((l) => l.groupId === top).map((l) => [l.sort, l.payee, l.day]), [[1, "Rent", 1], [2, "Monthly Expenses", 3]]);
  assert.equal(t.lines.find((l) => l.id === salary)!.amountPaise, null, "empty amount: asked each month");

  await saveTemplateEntry(db, { ...entry(TEMPLATE_MAIN), id: salary, direction: "credit", category: "Income", subcategory: "Salary", payee: "Employer", amountPaise: null, day: 2 }, grp({ name: "Budget", openingIncome: false, fundsHere: true }));
  const edited = await loadTemplate(db);
  assert.deepEqual([edited.lines.find((l) => l.id === salary)!.payee, edited.lines.find((l) => l.id === salary)!.day, edited.groups.length], ["Employer", 2, 2], "the same group, edited, not a second one");
  assert.deepEqual([edited.groups[0].name, edited.groups[0].openingIncome], ["Budget", false]);
});

test("each switch is on for one group at most, and the two are independent", async () => {
  const { db } = fresh();
  await saveTemplateEntry(db, entry(TEMPLATE_MAIN, { payee: "A" }), grp({ name: "A", fundsHere: true, home: true }));
  await saveTemplateEntry(db, entry(TEMPLATE_MAIN, { payee: "B" }), grp({ name: "B", fundsHere: true }));
  assert.deepEqual((await loadTemplate(db)).groups.map((g) => [g.name, g.fundsHere, g.home]), [["A", false, true], ["B", true, false]]);
});

test("an entry in a group that does not exist is refused", async () => {
  const { db } = fresh();
  await assert.rejects(saveTemplateEntry(db, entry("nope"), null), /exists/);
});

test("deleting an entry that created a group removes the group, its entries and the groups inside it; deleting a plain entry removes only it", async () => {
  const { db, raw } = fresh();
  const { salary, top } = await twoLevels(db);
  const rent = (await loadTemplate(db)).lines.find((l) => l.groupId === top && l.payee === "Rent")!;
  await deleteTemplateEntry(db, rent.id);
  assert.equal((await loadTemplate(db)).lines.length, 2);
  await deleteTemplateEntry(db, salary);
  assert.deepEqual(await loadTemplate(db), { groups: [], lines: [] });
  assert.equal(rows(raw, "SELECT * FROM month_template_groups").length, 0);
});

test("clearing 'create a group' on an entry removes that group and what is inside it", async () => {
  const { db } = fresh();
  const { salary } = await twoLevels(db);
  await saveTemplateEntry(db, { ...entry(TEMPLATE_MAIN), id: salary, direction: "credit", category: "Income", subcategory: "Salary", payee: "Blend", amountPaise: null }, null);
  const t = await loadTemplate(db);
  assert.deepEqual([t.groups.length, t.lines.length, t.lines[0].createsGroupId], [0, 1, null]);
});

test("setting a month up makes Main's entries, the groups with their opening income, and their entries", async () => {
  const { db, raw } = fresh();
  const { salary } = await twoLevels(db);
  await saveTemplateEntry(db, entry(TEMPLATE_MAIN, { payee: "Coffee club", amountPaise: 50000, day: 9 }), null);
  const plan = planSetup(await loadTemplate(db), "2026-12", { line: { [salary]: { amountPaise: 25683600 } } }, []);
  const result = await applySetup(db, plan, DEFAULT_CATEGORIES);
  assert.equal(result.groupsCreated, 2);

  const groups = rows(raw, "SELECT id, name, parent_id, start_date, end_date, held_paise FROM expense_groups WHERE id != 'main' ORDER BY rowid");
  assert.deepEqual(groups.map((g) => [g.name, g.start_date, g.end_date, g.held_paise]), [
    ["December 2026 - Savings and Expenses", "2026-12-01", "2026-12-31", 25683600],
    ["December 2026 Month Expenses", "2026-12-01", "2026-12-31", 0],
  ]);
  assert.equal(groups[0].parent_id, "main");
  assert.equal(groups[1].parent_id, groups[0].id);
  assert.equal(result.homeGroupId, groups[1].id, "the group with the Home switch");

  const inGroup = (id: string) => rows(raw, `SELECT direction, amount_paise, txn_date, payee, created_group_id FROM transactions WHERE group_id = '${id}' ORDER BY rowid`);
  assert.deepEqual(inGroup("main").map((r) => [r.direction, r.amount_paise, r.txn_date, r.payee, r.created_group_id === groups[0].id ? "creates" : null]), [
    ["debit", 50000, "2026-12-09", "Coffee club", null],
    ["credit", 25683600, "2026-12-01", "Blend", "creates"],
  ]);
  assert.deepEqual(inGroup(groups[0].id as string).map((r) => [r.direction, r.amount_paise, r.txn_date, r.payee]), [
    ["credit", 25683600, "2026-12-01", "Main"],
    ["debit", 2400000, "2026-12-01", "Rent"],
    ["debit", 2500000, "2026-12-03", "Monthly Expenses"],
  ]);
  assert.deepEqual(inGroup(groups[1].id as string).map((r) => [r.direction, r.amount_paise, r.payee]), [["credit", 2500000, groups[0].name]], "opening income from the group above");

  assert.deepEqual([...(await loadSetUpMonths(db))], ["2026-12"]);
  assert.equal(await fundsGroupFor(db, "2026-12"), groups[0].id);
  assert.equal(await fundsGroupFor(db, "2026-11"), null);
});

test("a group that does not start with the entry's amount has no opening income and holds nothing", async () => {
  const { db, raw } = fresh();
  await saveTemplateEntry(db, entry(TEMPLATE_MAIN, { direction: "credit", category: "Income", subcategory: "Salary", payee: "Blend", amountPaise: 1000000 }), grp({ name: "Plain", openingIncome: false }));
  await applySetup(db, planSetup(await loadTemplate(db), "2026-12", {}, []), DEFAULT_CATEGORIES);
  assert.deepEqual(rows(raw, "SELECT held_paise FROM expense_groups WHERE id != 'main'").map((g) => g.held_paise), [0]);
  assert.equal(rows(raw, "SELECT * FROM transactions WHERE group_id != 'main'").length, 0);
});

test("a deleted group is not the one for mutual funds any more", async () => {
  const { db, raw } = fresh();
  const { salary } = await twoLevels(db);
  await applySetup(db, planSetup(await loadTemplate(db), "2026-12", { line: { [salary]: { amountPaise: 100 } } }, []), DEFAULT_CATEGORIES);
  raw.exec("UPDATE expense_groups SET status = 'DELETED' WHERE name LIKE '%Savings and Expenses'");
  assert.equal(await fundsGroupFor(db, "2026-12"), null);
});

test("a plan with a problem is refused and creates nothing", async () => {
  const { db, raw } = fresh();
  await twoLevels(db);
  await assert.rejects(applySetup(db, planSetup(await loadTemplate(db), "2026-12", {}, []), DEFAULT_CATEGORIES), /Enter the amount/);
  assert.equal(rows(raw, "SELECT * FROM transactions").length, 0);
});

test("a group made by hand that covers any day of the month is found, and a deleted one is not", async () => {
  const { db, raw } = fresh();
  raw.exec("INSERT INTO expense_groups (id, name, start_date, end_date, parent_id) VALUES ('g1', 'November 2026 - Savings and Expenses', '2026-11-01', '2026-11-30', 'main')");
  raw.exec("INSERT INTO expense_groups (id, name, start_date, end_date, parent_id) VALUES ('g2', 'Sub', '2026-12-01', '2026-12-31', 'g1')");
  assert.equal(await monthGroupExists(db, "2026-11"), true);
  assert.equal(await monthGroupExists(db, "2026-12"), false, "a group under another group is not a month group");
  raw.exec("UPDATE expense_groups SET status = 'DELETED' WHERE id = 'g1'");
  assert.equal(await monthGroupExists(db, "2026-11"), false);
});

test("every CHECK on the template tables is named", () => {
  const checks = MONTH_TEMPLATE_SQL.match(/CHECK\b/g) ?? [];
  const named = MONTH_TEMPLATE_SQL.match(/CONSTRAINT \w+ CHECK\b/g) ?? [];
  assert.equal(named.length, checks.length);
  assert.ok(checks.length >= 6);
});

test("a database from the first template shape (a group with its own funding) is rebuilt; one in the new shape is left alone", () => {
  const old = new DatabaseSync(":memory:");
  old.exec("CREATE TABLE month_template_groups (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT, name TEXT NOT NULL, sort INTEGER NOT NULL, fund_direction TEXT NOT NULL, fund_day INTEGER NOT NULL)");
  old.exec("CREATE TABLE month_template_lines (id TEXT PRIMARY KEY NOT NULL, group_id TEXT NOT NULL, amount_paise INTEGER NOT NULL)");
  old.exec("CREATE TABLE month_setups (month TEXT NOT NULL, template_group_id TEXT NOT NULL, group_id TEXT NOT NULL, funds_here INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (month, template_group_id))");
  old.exec("INSERT INTO month_setups VALUES ('2026-11', 'tg', 'g', 1)");
  const names = (db: DatabaseSync) => db.prepare("SELECT name FROM pragma_table_info('month_template_groups')").all().map((r) => String((r as { name: string }).name));
  assert.equal(needsTemplateRebuild(names(old)), true);
  old.exec(DROP_TEMPLATE_V23_SQL);
  old.exec(MONTH_TEMPLATE_SQL);
  assert.equal(needsTemplateRebuild(names(old)), false);
  assert.ok(names(old).includes("opening_income"));
  assert.equal((old.prepare("SELECT COUNT(*) AS n FROM month_setups").get() as { n: number }).n, 1, "the set-up records are kept");
  assert.equal(needsTemplateRebuild(names(fresh().raw)), false);
});
