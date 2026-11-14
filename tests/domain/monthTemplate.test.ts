import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_MAIN, containersOf, dateInMonth, groupNameFor, monthLabel, offerSetup, planSetup, validateTemplateEntry, withSwitch, type MonthTemplate, type TemplateGroup, type TemplateLine } from "../../src/domain/monthTemplate";

const group = (id: string, over: Partial<TemplateGroup> = {}): TemplateGroup => ({ id, parentId: null, name: `Group ${id}`, sort: 1, openingIncome: true, fundsHere: false, home: false, ...over });
const line = (id: string, groupId: string, over: Partial<TemplateLine> = {}): TemplateLine => ({
  id, groupId, sort: 1, direction: "debit", category: "Households", subcategory: "Rent", payee: "Rent", paymentMethod: null, description: null, amountPaise: 2400000, day: 1, createsGroupId: null, ...over,
});

test("a group name takes the month where {Month} and {Year} are, and gets the month added at the end when it has neither", () => {
  assert.equal(groupNameFor("{Month} {Year} - Savings and Expenses", "2026-12"), "December 2026 - Savings and Expenses");
  assert.equal(groupNameFor("Budget {month}", "2026-03"), "Budget March");
  assert.equal(groupNameFor("Day to day", "2026-12"), "Day to day Dec 2026");
  assert.equal(monthLabel("2026-12"), "December 2026");
});

test("an entry's day is that day of the month, and the last day when the month is shorter", () => {
  assert.equal(dateInMonth("2026-12", 27), "2026-12-27");
  assert.equal(dateInMonth("2026-04", 31), "2026-04-30");
  assert.equal(dateInMonth("2027-02", 30), "2027-02-28");
  assert.equal(dateInMonth("2028-02", 31), "2028-02-29");
});

test("an entry needs a category, a payee and a day from 1 to 31; its amount may be empty; a group it creates needs a new name", () => {
  const ok = { direction: "debit" as const, category: "Households", subcategory: "Rent", payee: "Rent", paymentMethod: null, description: null, amountPaise: 100, day: 5 };
  assert.equal(validateTemplateEntry(ok, null, []), null);
  assert.equal(validateTemplateEntry({ ...ok, amountPaise: null }, null, []), null);
  assert.ok(validateTemplateEntry({ ...ok, subcategory: "" }, null, []));
  assert.match(validateTemplateEntry({ ...ok, direction: "credit", payee: " " }, null, []) ?? "", /payer/);
  assert.ok(validateTemplateEntry({ ...ok, amountPaise: 0 }, null, []));
  assert.ok(validateTemplateEntry({ ...ok, amountPaise: -1 }, null, []));
  assert.match(validateTemplateEntry({ ...ok, day: 0 }, null, []) ?? "", /1 to 31/);
  const made = { name: "Savings", openingIncome: true, fundsHere: false, home: false };
  assert.equal(validateTemplateEntry(ok, made, ["Other"]), null);
  assert.match(validateTemplateEntry(ok, { ...made, name: " " }, []) ?? "", /name/);
  assert.match(validateTemplateEntry(ok, { ...made, name: "savings" }, ["Savings"]) ?? "", /Another template group/);
});

const template = (): MonthTemplate => ({
  groups: [
    group("top", { name: "{Month} {Year} - Savings", fundsHere: true }),
    group("sub", { parentId: "top", name: "Day to day", home: true }),
  ],
  lines: [
    line("salary", TEMPLATE_MAIN, { direction: "credit", category: "Income", subcategory: "Salary", payee: "Blend", amountPaise: null, createsGroupId: "top" }),
    line("rent", "top", { sort: 1 }),
    line("budget", "top", { sort: 2, payee: "Monthly Expenses", category: "Expenses", subcategory: "Monthly Expenses", amountPaise: 2500000, day: 3, createsGroupId: "sub" }),
    line("ins", "top", { sort: 3, payee: "Insurance", amountPaise: 869600, day: 27 }),
  ],
});

test("Main comes first, then each group straight after the entry that creates it, with its own entries", () => {
  const c = containersOf(template());
  assert.deepEqual(c.map((n) => [n.id, n.depth, n.lines.map((l) => l.id)]), [
    [TEMPLATE_MAIN, 0, ["salary"]],
    ["top", 1, ["rent", "budget", "ins"]],
    ["sub", 2, []],
  ]);
  assert.equal(c[0].group, null);
});

test("a group that no entry creates is left out, and a loop is not followed forever", () => {
  const t = template();
  t.groups.push(group("orphan"));
  t.lines.push(line("loop", "sub", { createsGroupId: "top" }));
  assert.deepEqual(containersOf(t).map((n) => n.id), [TEMPLATE_MAIN, "top", "sub"]);
});

test("turning a switch on turns it off on the other groups, and the other switch is left alone", () => {
  const groups = [group("a", { fundsHere: true, home: true }), group("b")];
  const next = withSwitch(groups, "b", "fundsHere", true);
  assert.deepEqual(next.map((g) => [g.fundsHere, g.home]), [[false, true], [true, false]]);
  assert.deepEqual(withSwitch(next, "b", "fundsHere", false).map((g) => g.fundsHere), [false, false]);
});

test("setting December up plans Main's entries, each group made by its entry, and the other entries on their days", () => {
  const plan = planSetup(template(), "2026-12", { line: { salary: { amountPaise: 25683600 } } }, []);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.mainLines, []);
  assert.deepEqual(plan.groups.map((g) => [g.name, g.parentTemplateId, g.startDate, g.endDate]), [
    ["December 2026 - Savings", null, "2026-12-01", "2026-12-31"],
    ["Day to day Dec 2026", "top", "2026-12-01", "2026-12-31"],
  ]);
  assert.deepEqual([plan.groups[0].funding.date, plan.groups[0].funding.amountPaise, plan.groups[0].funding.direction, plan.groups[0].funding.lineId], ["2026-12-01", 25683600, "credit", "salary"]);
  assert.deepEqual([plan.groups[1].funding.date, plan.groups[1].funding.amountPaise, plan.groups[1].funding.direction], ["2026-12-03", 2500000, "debit"]);
  assert.deepEqual(plan.groups[0].lines.map((l) => [l.date, l.payee, l.amountPaise]), [["2026-12-01", "Rent", 2400000], ["2026-12-27", "Insurance", 869600]]);
  assert.deepEqual(plan.groups.map((g) => [g.fundsHere, g.home, g.openingIncome]), [[true, false, true], [false, true, true]]);
});

test("an entry in Main that creates no group is planned in Main", () => {
  const t = template();
  t.lines.push(line("coffee", TEMPLATE_MAIN, { sort: 2, payee: "Coffee club", amountPaise: 50000, day: 9 }));
  const plan = planSetup(t, "2026-12", { line: { salary: { amountPaise: 100 } } }, []);
  assert.deepEqual(plan.mainLines.map((l) => [l.payee, l.date]), [["Coffee club", "2026-12-09"]]);
});

test("an amount left empty in the template must be filled in before the month can be set up", () => {
  const plan = planSetup(template(), "2026-12", {}, []);
  assert.equal(plan.problems.length, 1);
  assert.match(plan.problems[0], /Enter the amount for Blend/);
  assert.equal(planSetup(template(), "2026-12", { line: { salary: { amountPaise: null } } }, []).problems.length, 1);
});

test("a change in the preview is for this month only: the amount and day of any entry", () => {
  const t = template();
  const plan = planSetup(t, "2026-12", { line: { salary: { amountPaise: 100 }, rent: { amountPaise: 2600000, day: 2 }, budget: { day: 31 } } }, []);
  assert.deepEqual([plan.groups[0].lines[0].date, plan.groups[0].lines[0].amountPaise], ["2026-12-02", 2600000]);
  assert.equal(plan.groups[1].funding.date, "2026-12-31");
  assert.equal(t.lines.find((l) => l.id === "rent")!.amountPaise, 2400000, "the template is not changed");
});

test("a name that is taken, an empty template and a bad day are all said", () => {
  assert.match(planSetup(template(), "2026-12", { line: { salary: { amountPaise: 1 } } }, ["december 2026 - savings"]).problems[0], /already exists/);
  assert.match(planSetup({ groups: [], lines: [] }, "2026-12", {}, []).problems[0], /no entries/);
  assert.match(planSetup(template(), "2026-12", { line: { salary: { amountPaise: 1 }, rent: { day: 40 } } }, []).problems[0], /1 to 31/);
});

test("the offer appears only when there is a template, the month is not set up, no group made by hand covers it and it was not dismissed", () => {
  const base = { month: "2026-12", hasTemplate: true, setUpMonths: new Set<string>(), monthGroupExists: false, dismissedMonth: null };
  assert.equal(offerSetup(base), true);
  assert.equal(offerSetup({ ...base, hasTemplate: false }), false);
  assert.equal(offerSetup({ ...base, setUpMonths: new Set(["2026-12"]) }), false);
  assert.equal(offerSetup({ ...base, setUpMonths: new Set(["2026-11"]) }), true);
  assert.equal(offerSetup({ ...base, monthGroupExists: true }), false);
  assert.equal(offerSetup({ ...base, dismissedMonth: "2026-12" }), false);
  assert.equal(offerSetup({ ...base, dismissedMonth: "2026-11" }), true);
});
