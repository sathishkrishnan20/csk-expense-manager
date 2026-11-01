import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAIN_GROUP_ID,
  balanceOf,
  childrenOf,
  createdGroupInfo,
  descendantIds,
  flattenTree,
  groupDatesLabel,
  homeStripGroups,
  isMainGroup,
  scopedKey,
  stripGroups,
  totalInPaise,
  totalOutPaise,
  validateGroup,
  validateParent,
  withRolledUp,
  type Group,
} from "../../src/domain/groups";

test("Main keeps the bank's own key, a group prefixes it", () => {
  assert.equal(scopedKey(MAIN_GROUP_ID, "upi:629618527541:D"), "upi:629618527541:D");
  assert.equal(scopedKey("g-abc", "upi:629618527541:D"), "g-abc|upi:629618527541:D");
  assert.notEqual(scopedKey("g-abc", "k"), scopedKey("g-def", "k"));
});

test("only the built-in group is Main", () => {
  assert.ok(isMainGroup("main"));
  assert.ok(!isMainGroup("g-abc"));
});

test("balance is income minus expenses and may be negative", () => {
  assert.equal(balanceOf({ inPaise: 2000000, outPaise: 1658000 }), 342000);
  assert.equal(balanceOf({ inPaise: 0, outPaise: 500 }), -500);
});

test("group form: name is required and unique, dates must be in order", () => {
  const ok = { name: "Ooty trip", startDate: null, endDate: null };
  assert.equal(validateGroup(ok, ["Main"]), null);
  assert.match(validateGroup({ ...ok, name: "   " }, []) ?? "", /name/);
  assert.match(validateGroup({ ...ok, name: " main " }, ["Main"]) ?? "", /already exists/);
  assert.match(validateGroup({ ...ok, startDate: "2026-11-05", endDate: "2026-11-01" }, []) ?? "", /end date/);
  assert.equal(validateGroup({ ...ok, startDate: "2026-11-05", endDate: "2026-11-05" }, []), null);
  assert.equal(validateGroup({ ...ok, startDate: "2026-11-05", endDate: null }, []), null);
  assert.equal(validateGroup({ ...ok, startDate: null, endDate: "2026-11-01" }, []), null);
});

test("dates label covers both, one and none", () => {
  const f = (iso: string) => iso;
  assert.equal(groupDatesLabel({ startDate: "2026-11-01", endDate: "2026-11-05" }, f), "2026-11-01 - 2026-11-05");
  assert.equal(groupDatesLabel({ startDate: "2026-11-01", endDate: null }, f), "From 2026-11-01");
  assert.equal(groupDatesLabel({ startDate: null, endDate: "2026-11-05" }, f), "Until 2026-11-05");
  assert.equal(groupDatesLabel({ startDate: null, endDate: null }, f), null);
});

// --- groups inside groups -------------------------------------------------------------------

const g = (id: string, parentId: string | null, inRupees = 0, outRupees = 0, over: Partial<Group> = {}) => ({
  id,
  name: id,
  startDate: null,
  endDate: null,
  status: "ACTIVE" as const,
  parentId,
  pinned: false,
  heldPaise: 0,
  inPaise: inRupees * 100,
  outPaise: outRupees * 100,
  ...over,
});

test("a balance includes the groups under it (own income - own expenses + subgroups)", () => {
  assert.equal(balanceOf({ inPaise: 0, outPaise: 6000000, subgroupsPaise: 1500000 }), -4500000);
});

test("roll-up: the day-to-day lump sum in Nov is cancelled by the opening income in its subgroup, so only the spending counts", () => {
  // Main: salary 100000. Nov (under Main): MF 10000, savings 20000, day-to-day lump sum 30000. Day to day (under Nov): opening 30000, spent 12000.
  const rolled = withRolledUp([g("main", null, 100000), g("nov", "main", 0, 60000), g("day", "nov", 30000, 12000)]);
  const by = Object.fromEntries(rolled.map((x) => [x.id, x]));
  assert.equal(balanceOf(by.day), 1800000);
  assert.equal(balanceOf(by.nov), -4200000); // -60000 + 18000
  assert.equal(by.nov.subgroupsPaise, 1800000);
  assert.equal(balanceOf(by.main), 5800000); // salary 100000 - MF 10000 - savings 20000 - spent 12000 = 58000
  assert.equal(by.main.subgroupsPaise, -4200000);
});

test("the Income and Expenses cards of a group include everything below it, so income - expenses is the balance", () => {
  const rolled = withRolledUp([g("main", null, 100000), g("nov", "main", 0, 60000), g("day", "nov", 30000, 12000)]);
  const by = Object.fromEntries(rolled.map((x) => [x.id, x]));
  // the expense added in the deepest group shows in every group above it
  assert.equal(totalOutPaise(by.day), 1200000);
  assert.equal(totalOutPaise(by.nov), 7200000); // 60000 + 12000
  assert.equal(totalOutPaise(by.main), 7200000);
  assert.equal(totalInPaise(by.nov), 3000000); // the day-to-day opening income
  assert.equal(totalInPaise(by.main), 13000000); // salary + that opening income
  for (const x of rolled) assert.equal(totalInPaise(x) - totalOutPaise(x), balanceOf(x));
  assert.equal(by.nov.subgroupsOutPaise, 1200000);
  assert.equal(by.main.subgroupsOutPaise, 7200000);
});

test("a group kept separate (no parent) does not affect Main", () => {
  const rolled = withRolledUp([g("main", null, 5000), g("bank2", null, 900, 100)]);
  assert.equal(balanceOf(rolled[0]), 500000);
  assert.equal(balanceOf(rolled[1]), 80000);
});

test("a parent that is not in the list counts as no parent, and a loop does not run forever", () => {
  const orphan = withRolledUp([g("main", null, 100), g("x", "gone", 50)]);
  assert.equal(balanceOf(orphan[0]), 10000);
  assert.equal(balanceOf(orphan[1]), 5000);
  const loop = withRolledUp([g("a", "b", 10), g("b", "a", 20)]);
  assert.equal(loop.length, 2);
});

test("children and descendants", () => {
  const all = [g("main", null), g("nov", "main"), g("day", "nov"), g("mf", "nov"), g("trip", null)];
  assert.deepEqual(childrenOf(all, "nov").map((x) => x.id), ["day", "mf"]);
  assert.deepEqual([...descendantIds(all, "main")].sort(), ["day", "mf", "nov"]);
  assert.deepEqual([...descendantIds(all, "day")], []);
  assert.deepEqual([...descendantIds([g("a", "b"), g("b", "a")], "a")], ["b"]);
});

test("tree order: a group, then what is under it, with depth; separate groups follow", () => {
  const all = [g("main", null), g("trip", null), g("nov", "main"), g("day", "nov"), g("dec", "main")];
  assert.deepEqual(
    flattenTree(all).map((x) => `${x.group.id}:${x.depth}`),
    ["main:0", "nov:1", "day:2", "dec:1", "trip:0"],
  );
  // a group whose parent is not in the list (for example a closed subgroup of an open group) is shown at the top
  assert.deepEqual(flattenTree([g("day", "nov")]).map((x) => `${x.group.id}:${x.depth}`), ["day:0"]);
});

test("Home strip on Main: pinned groups at any depth first, then the groups right under Main or kept separate; closed ones never", () => {
  const all = [
    g("main", null),
    g("nov", "main"),
    g("day", "nov", 0, 0, { pinned: true }),
    g("trip", null),
    g("bank2", "main", 0, 0, { pinned: true }),
    g("old", "main", 0, 0, { status: "CLOSED", pinned: true }),
  ];
  assert.deepEqual(stripGroups(all, MAIN_GROUP_ID).map((x) => x.id), ["day", "bank2", "nov", "trip"]);
});

test("a group's strip is its own subgroups, pinned first", () => {
  const all = [g("main", null), g("nov", "main"), g("day", "nov"), g("mf", "nov", 0, 0, { pinned: true }), g("trip", "main")];
  assert.deepEqual(stripGroups(all, "nov").map((x) => x.id), ["mf", "day"]);
  assert.deepEqual(stripGroups(all, "day"), []);
});

test("a group cannot sit under itself or under its own subgroup, Main has no parent, and the parent must exist", () => {
  const all = [g("main", null), g("nov", "main"), g("day", "nov"), g("trip", null)];
  assert.equal(validateParent(all, "nov", "main"), null);
  assert.equal(validateParent(all, "nov", null), null);
  assert.equal(validateParent(all, null, "nov"), null); // a new group
  assert.match(validateParent(all, "nov", "nov") ?? "", /inside itself/);
  assert.match(validateParent(all, "nov", "day") ?? "", /own subgroups/);
  assert.match(validateParent(all, "main", "trip") ?? "", /Main cannot/);
  assert.match(validateParent(all, "trip", "missing") ?? "", /exists/);
});

test("the entry that created a group shows what is left in it: 25,000 in, 5,000 spent -> 20,000", () => {
  const rolled = withRolledUp([g("main", null, 0, 25000), g("trip", "main", 25000, 5000)]);
  assert.deepEqual(createdGroupInfo(rolled, "trip"), { name: "trip", balancePaise: 2000000 });
  // what its own subgroups hold counts too
  const deeper = withRolledUp([g("trip", "main", 25000, 5000), g("food", "trip", 0, 3000)]);
  assert.equal(createdGroupInfo(deeper, "trip")?.balancePaise, 1700000);
  assert.equal(createdGroupInfo(rolled, null), null);
  assert.equal(createdGroupInfo(rolled, "deleted-group"), null);
});

test("a group made from an income keeps that income to spend, but the parent does not count it twice (2.5L income, group made from it, 5,000 spent)", () => {
  // Main: income 2,50,000. Goa (under Main): opening income 2,50,000 (held), spent 5,000.
  const rolled = withRolledUp([g("main", null, 250000), g("goa", "main", 250000, 5000, { heldPaise: 25000000 })]);
  const by = Object.fromEntries(rolled.map((x) => [x.id, x]));
  assert.equal(balanceOf(by.goa), 24500000); // the group shows what is left to spend
  assert.equal(balanceOf(by.main), 24500000); // Main: 2.5L income - 5,000 spent, not 5L
  assert.equal(totalInPaise(by.main), 25000000); // the held income is not added to Main's Income card
  assert.equal(totalOutPaise(by.main), 500000);
  assert.equal(totalInPaise(by.goa), 25000000); // but the group's own Income card shows it
  assert.equal(createdGroupInfo(rolled, "goa")?.balancePaise, 24500000);
});

test("held income never exceeds what the group really has (the opening entry may have been deleted)", () => {
  const rolled = withRolledUp([g("main", null, 250000), g("goa", "main", 0, 5000, { heldPaise: 25000000 })]);
  const by = Object.fromEntries(rolled.map((x) => [x.id, x]));
  assert.equal(balanceOf(by.goa), -500000);
  assert.equal(balanceOf(by.main), 24500000);
});

test("held income passes through nested groups once", () => {
  const rolled = withRolledUp([g("main", null, 1000), g("a", "main", 400, 0, { heldPaise: 40000 }), g("b", "a", 100, 30, { heldPaise: 10000 })]);
  const by = Object.fromEntries(rolled.map((x) => [x.id, x]));
  assert.equal(balanceOf(by.b), 7000);
  assert.equal(balanceOf(by.a), 37000); // 400 own, minus the 30 that b spent (b's own 100 is held)
  assert.equal(balanceOf(by.main), 100000 - 3000); // 1000 - what b spent; both held incomes stay out
});

test("Home strip while a group is the home group: pinned, then Main, then its own subgroups, then the other top-level groups; never itself or closed ones", () => {
  const all = [
    g("main", null),
    g("nov", "main"),
    g("day", "nov"),
    g("mf", "nov", 0, 0, { pinned: true }),
    g("trip", null),
    g("old", "main", 0, 0, { status: "CLOSED" }),
    g("bank2", "main", 0, 0, { pinned: true }),
  ];
  assert.deepEqual(homeStripGroups(all, "nov").map((x) => x.id), ["mf", "bank2", "main", "day", "trip"]);
  // with Main as the home group, Main is not listed (it is the screen) and the top-level groups follow the pinned ones
  assert.deepEqual(homeStripGroups(all, "main").map((x) => x.id), ["mf", "bank2", "nov", "trip"]);
});
