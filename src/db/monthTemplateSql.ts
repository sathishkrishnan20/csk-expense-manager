import { heldOpening, incomeClassFor, openingIncomeFor } from "../domain/entryGroup";
import type { CategoryDef } from "../domain/masterData";
import { TEMPLATE_MAIN, emptyTemplate, type EntryFields, type GroupFields, type MonthSetup, type MonthTemplate, type PlannedEntry, type SetupPlan, type TemplateGroup, type TemplateLine } from "../domain/monthTemplate";
import type { Direction } from "../domain/taxonomy";
import type { AssetDb as SqlDb } from "./assetSql";

// The SQL of the monthly template (domain/monthTemplate.ts), against the same small adapter as savingsSql.ts so it runs on the phone and in Node's SQLite
// (tests/db/monthTemplateSql.test.ts). Each function that writes several rows is meant to run inside the caller's transaction.

const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface GroupRow {
  id: string;
  parent_id: string | null;
  name: string;
  sort: number;
  opening_income: number;
  funds_here: number;
  home: number;
}

interface LineRow {
  id: string;
  group_id: string;
  sort: number;
  direction: Direction;
  category: string;
  subcategory: string;
  payee: string;
  payment_method: string | null;
  description: string | null;
  amount_paise: number | null;
  day: number;
  creates_group_id: string | null;
}

const toGroup = (r: GroupRow): TemplateGroup => ({
  id: r.id,
  parentId: r.parent_id,
  name: r.name,
  sort: r.sort,
  openingIncome: r.opening_income === 1,
  fundsHere: r.funds_here === 1,
  home: r.home === 1,
});

const toLine = (r: LineRow): TemplateLine => ({
  id: r.id,
  groupId: r.group_id,
  sort: r.sort,
  direction: r.direction,
  category: r.category,
  subcategory: r.subcategory,
  payee: r.payee,
  paymentMethod: r.payment_method,
  description: r.description,
  amountPaise: r.amount_paise,
  day: r.day,
  createsGroupId: r.creates_group_id,
});

export async function loadTemplate(db: SqlDb): Promise<MonthTemplate> {
  const groups = (await db.all<GroupRow>("SELECT * FROM month_template_groups ORDER BY sort, rowid")).map(toGroup);
  const lines = (await db.all<LineRow>("SELECT * FROM month_template_lines ORDER BY group_id, sort, rowid")).map(toLine);
  return groups.length === 0 && lines.length === 0 ? emptyTemplate() : { groups, lines };
}

// Removes a template group, every group made by an entry inside it (however deep) and all their entries. The entry that created the group is the caller's to remove.
async function removeGroupTree(db: SqlDb, id: string): Promise<void> {
  const lines = (await db.all<LineRow>("SELECT * FROM month_template_lines")).map(toLine);
  const doomed = new Set<string>([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const l of lines) {
      if (doomed.has(l.groupId) && l.createsGroupId !== null && !doomed.has(l.createsGroupId)) {
        doomed.add(l.createsGroupId);
        grew = true;
      }
    }
  }
  for (const gone of doomed) {
    await db.run("DELETE FROM month_template_lines WHERE group_id = ?", [gone]);
    await db.run("DELETE FROM month_template_groups WHERE id = ?", [gone]);
  }
}

export type EntryInput = EntryFields & { id?: string; groupId: string };

// Saves a template entry (a new one when it has no id) and, as when adding a transaction, the group it creates: `group` set makes or updates that group (sitting in the group
// the entry is in), `group` null on an entry that created one removes that group, its entries and the groups inside it. Turning on "mutual funds go here" or "Home" turns it
// off on every other group (each is on for one group at most). Returns the entry's id.
export async function saveTemplateEntry(db: SqlDb, e: EntryInput, group: GroupFields | null): Promise<string> {
  if (e.groupId !== TEMPLATE_MAIN && !(await db.first("SELECT 1 AS x FROM month_template_groups WHERE id = ?", [e.groupId]))) throw new Error("Choose a group that exists.");
  const existing = e.id ? await db.first<LineRow>("SELECT * FROM month_template_lines WHERE id = ?", [e.id]) : null;
  const id = e.id ?? newId("tl");
  let createsGroupId = existing?.creates_group_id ?? null;

  if (group) {
    if (createsGroupId === null) {
      createsGroupId = newId("tg");
      const sort = (await db.first<{ next: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM month_template_groups"))?.next ?? 1;
      await db.run("INSERT INTO month_template_groups (id, parent_id, name, sort, opening_income, funds_here, home) VALUES (?, ?, ?, ?, ?, 0, 0)", [createsGroupId, e.groupId === TEMPLATE_MAIN ? null : e.groupId, group.name.trim(), sort, group.openingIncome ? 1 : 0]);
    }
    if (group.fundsHere) await db.run("UPDATE month_template_groups SET funds_here = 0 WHERE id != ?", [createsGroupId]);
    if (group.home) await db.run("UPDATE month_template_groups SET home = 0 WHERE id != ?", [createsGroupId]);
    await db.run("UPDATE month_template_groups SET name = ?, opening_income = ?, funds_here = ?, home = ? WHERE id = ?", [group.name.trim(), group.openingIncome ? 1 : 0, group.fundsHere ? 1 : 0, group.home ? 1 : 0, createsGroupId]);
  } else if (createsGroupId !== null) {
    await removeGroupTree(db, createsGroupId);
    createsGroupId = null;
  }

  const values = [e.direction, e.category, e.subcategory, e.payee.trim(), e.paymentMethod, e.description?.trim() || null, e.amountPaise, e.day, createsGroupId];
  if (existing) {
    await db.run("UPDATE month_template_lines SET direction = ?, category = ?, subcategory = ?, payee = ?, payment_method = ?, description = ?, amount_paise = ?, day = ?, creates_group_id = ? WHERE id = ?", [...values, id]);
  } else {
    const sort = (await db.first<{ next: number }>("SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM month_template_lines WHERE group_id = ?", [e.groupId]))?.next ?? 1;
    await db.run(
      "INSERT INTO month_template_lines (direction, category, subcategory, payee, payment_method, description, amount_paise, day, creates_group_id, id, group_id, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [...values, id, e.groupId, sort],
    );
  }
  return id;
}

// Deletes a template entry; when it created a group, that group, its entries and the groups inside it go too. Months already set up are not touched.
export async function deleteTemplateEntry(db: SqlDb, id: string): Promise<void> {
  const line = await db.first<LineRow>("SELECT * FROM month_template_lines WHERE id = ?", [id]);
  if (!line) return;
  if (line.creates_group_id !== null) await removeGroupTree(db, line.creates_group_id);
  await db.run("DELETE FROM month_template_lines WHERE id = ?", [id]);
}

// ---- setting a month up -------------------------------------------------------------------------------------------------------------------------

export async function loadSetUpMonths(db: SqlDb): Promise<Set<string>> {
  return new Set((await db.all<{ month: string }>("SELECT DISTINCT month FROM month_setups")).map((r) => r.month));
}

// Whether a group directly under Main (made by hand, or by an earlier set-up) already covers any day of the month.
export async function monthGroupExists(db: SqlDb, month: string): Promise<boolean> {
  const last = `${month}-31`;
  const row = await db.first(
    "SELECT 1 AS x FROM expense_groups WHERE parent_id = 'main' AND status != 'DELETED' AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= ? AND end_date >= ? LIMIT 1",
    [last, `${month}-01`],
  );
  return row !== null;
}

export async function loadGroupNames(db: SqlDb): Promise<string[]> {
  return (await db.all<{ name: string }>("SELECT name FROM expense_groups WHERE status != 'DELETED'")).map((r) => r.name);
}

async function insertEntry(db: SqlDb, groupId: string, createdGroupId: string | null, e: PlannedEntry): Promise<void> {
  await db.run(
    `INSERT INTO transactions (id, source, group_id, created_group_id, txn_date, direction, amount_paise, category, subcategory, payee, payment_method, description, classified_by)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
    [newId("m"), groupId, createdGroupId, e.date, e.direction, e.amountPaise, e.category, e.subcategory, e.payee, e.paymentMethod, e.description],
  );
}

export interface SetupResult {
  groupsCreated: number;
  entriesCreated: number;
  homeGroupId: string | null; // the group the app should open on now, when a template group has the Home switch on
}

// Creates what a set-up plan describes, all inside the caller's transaction: the entries made in Main, then for each group the entry that creates it (made in its parent, with the
// group's opening income when it has one, as "Create a group for this entry" does), its other entries, and a month_setups row. The plan must have no problems.
export async function applySetup(db: SqlDb, plan: SetupPlan, categories: readonly CategoryDef[]): Promise<SetupResult> {
  if (plan.problems.length > 0) throw new Error(plan.problems[0]);
  const made = new Map<string, { id: string; name: string }>();
  const income = incomeClassFor(categories);
  const result: SetupResult = { groupsCreated: 0, entriesCreated: 0, homeGroupId: null };

  for (const entry of plan.mainLines) {
    await insertEntry(db, "main", null, entry);
    result.entriesCreated++;
  }
  for (const g of plan.groups) {
    const parent = g.parentTemplateId === null ? { id: "main", name: "Main" } : made.get(g.parentTemplateId);
    if (!parent) throw new Error("A template group's parent was not set up first.");
    const groupId = newId("g");
    const held = heldOpening(g.funding.direction, g.funding.amountPaise, g.openingIncome);
    await db.run("INSERT INTO expense_groups (id, name, start_date, end_date, parent_id, held_paise) VALUES (?, ?, ?, ?, ?, ?)", [groupId, g.name, g.startDate, g.endDate, parent.id, held]);
    if (g.openingIncome) {
      const opening = openingIncomeFor({ txnDate: g.funding.date, amountPaise: g.funding.amountPaise, paymentMethod: null, payee: g.funding.payee, description: g.funding.description }, income, parent.name);
      await insertEntry(db, groupId, null, { ...opening, lineId: g.funding.lineId, date: opening.txnDate });
      result.entriesCreated++;
    }
    await insertEntry(db, parent.id, groupId, g.funding);
    for (const line of g.lines) await insertEntry(db, groupId, null, line);
    await db.run("INSERT OR REPLACE INTO month_setups (month, template_group_id, group_id, funds_here) VALUES (?, ?, ?, ?)", [plan.month, g.templateId, groupId, g.fundsHere ? 1 : 0]);
    made.set(g.templateId, { id: groupId, name: g.name });
    result.groupsCreated++;
    result.entriesCreated += 1 + g.lines.length;
    if (g.home) result.homeGroupId = groupId;
  }
  return result;
}

// The group this month's set-up marked for mutual fund purchases, when it is still there.
export async function fundsGroupFor(db: SqlDb, month: string): Promise<string | null> {
  const row = await db.first<{ group_id: string }>(
    `SELECT s.group_id FROM month_setups s JOIN expense_groups g ON g.id = s.group_id
     WHERE s.month = ? AND s.funds_here = 1 AND g.status != 'DELETED' LIMIT 1`,
    [month],
  );
  return row?.group_id ?? null;
}

// Every month's set-up record (for the backup).
export async function loadSetups(db: SqlDb): Promise<MonthSetup[]> {
  return (await db.all<{ month: string; template_group_id: string; group_id: string; funds_here: number }>("SELECT * FROM month_setups ORDER BY month, template_group_id")).map((r) => ({
    month: r.month,
    templateGroupId: r.template_group_id,
    groupId: r.group_id,
    fundsHere: r.funds_here === 1,
  }));
}
