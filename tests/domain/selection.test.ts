import { test } from "node:test";
import assert from "node:assert/strict";
import { keepPresent, selectAll, toggle } from "../../src/domain/selection";

test("toggle adds and removes without changing the original set", () => {
  const start = new Set(["a"]);
  const added = toggle(start, "b");
  assert.deepEqual([...added].sort(), ["a", "b"]);
  assert.deepEqual([...toggle(added, "a")], ["b"]);
  assert.deepEqual([...start], ["a"]);
});

test("select all takes every id, and ticks that are no longer listed are dropped", () => {
  assert.deepEqual([...selectAll(["a", "b", "c"])], ["a", "b", "c"]);
  assert.deepEqual([...keepPresent(new Set(["a", "x"]), ["a", "b"])], ["a"]);
});
