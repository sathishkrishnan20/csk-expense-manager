import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeKey, scopeLabel, spansSeveralGroups, toggleInScope } from "../../src/domain/groupScope";

const names = new Map([
  ["main", "Main"],
  ["nov", "Nov Month Expenses"],
  ["day", "Day to day"],
]);

test("the filter button says what is covered", () => {
  assert.equal(scopeLabel(null, names), "All groups");
  assert.equal(scopeLabel(["nov"], names), "Nov Month Expenses");
  assert.equal(scopeLabel(["nov", "day"], names), "2 groups");
  assert.equal(scopeLabel(["unknown"], names), "1 group");
  assert.equal(scopeLabel([], names), "No group");
});

test("ticking groups: from All it narrows to that group, more can be added and removed, at least one stays", () => {
  assert.deepEqual(toggleInScope(null, "day"), ["day"]);
  assert.deepEqual(toggleInScope(["day"], "nov"), ["day", "nov"]);
  assert.deepEqual(toggleInScope(["day", "nov"], "day"), ["nov"]);
  assert.deepEqual(toggleInScope(["nov"], "nov"), ["nov"]); // the last one cannot be unticked
});

test("rows say which group they are in when the page covers several", () => {
  assert.equal(spansSeveralGroups(null), true);
  assert.equal(spansSeveralGroups(["a", "b"]), true);
  assert.equal(spansSeveralGroups(["a"]), false);
});

test("the selection key ignores order", () => {
  assert.equal(scopeKey(["b", "a"]), scopeKey(["a", "b"]));
  assert.notEqual(scopeKey(["a"]), scopeKey(["a", "b"]));
  assert.equal(scopeKey(null), "*");
});
