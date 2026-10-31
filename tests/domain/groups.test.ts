import { test } from "node:test";
import assert from "node:assert/strict";
import { MAIN_GROUP_ID, balanceOf, groupDatesLabel, isMainGroup, scopedKey, validateGroup } from "../../src/domain/groups";

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
