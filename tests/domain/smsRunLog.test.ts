import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRunStatus, mergeRunLog, parseOutcomes, parseRunLog, trimOutcomes, type SmsOutcomeRecord, type SmsRun } from "../../src/domain/smsRunLog";

const run = (id: string, ms: number, extra: Partial<SmsRun> = {}): SmsRun => ({ id, at: new Date(ms).toISOString(), length: 120, empty: false, ...extra });

test("the native run records are read, and anything unreadable is dropped", () => {
  const json = JSON.stringify([
    { id: "a", at: 1_000, length: 90, empty: false },
    { id: "b", at: 2_000, length: 0, empty: true },
    { id: 7, at: 3_000 },
    { at: 4_000 },
    null,
  ]);
  const runs = parseRunLog(json);
  assert.deepEqual(
    runs.map((r) => [r.id, r.length, r.empty]),
    [
      ["a", 90, false],
      ["b", 0, true],
    ],
  );
  assert.equal(runs[0].at, new Date(1_000).toISOString());
  assert.deepEqual(parseRunLog("not json"), []);
  assert.deepEqual(parseRunLog('{"id":"a"}'), []);
});

test("stored results are read, and bad entries are dropped", () => {
  const at = new Date(5_000).toISOString();
  const parsed = parseOutcomes(JSON.stringify({ a: { outcome: "saved", at }, b: { outcome: "bogus", at }, c: { outcome: "saved" }, d: 3 }));
  assert.deepEqual(Object.keys(parsed), ["a"]);
  assert.deepEqual(parseOutcomes(null), {});
  assert.deepEqual(parseOutcomes("[1,2]"), {});
  assert.deepEqual(parseOutcomes("oops"), {});
});

test("only the newest results are kept", () => {
  const outcomes: Record<string, SmsOutcomeRecord> = {};
  for (let i = 0; i < 5; i++) outcomes[`m${i}`] = { outcome: "saved", at: new Date(i * 1000).toISOString() };
  assert.deepEqual(Object.keys(trimOutcomes(outcomes, 3)).sort(), ["m2", "m3", "m4"]);
  assert.equal(trimOutcomes(outcomes, 10), outcomes);
});

test("three messages in a few seconds: each run shows where its message ended up, newest first", () => {
  const runs = [run("one", 1_000), run("two", 3_000), run("three", 5_000)];
  const outcomes: Record<string, SmsOutcomeRecord> = {
    one: { outcome: "saved", at: new Date(9_000).toISOString() },
    two: { outcome: "already_had", at: new Date(9_000).toISOString() },
  };
  const rows = mergeRunLog(runs, outcomes, new Set(["three"]));
  assert.deepEqual(
    rows.map((r) => [r.id, r.status]),
    [
      ["three", "queued"],
      ["two", "already_had"],
      ["one", "saved"],
    ],
  );
});

test("a run that is neither queued nor recorded is flagged, and an empty one says so", () => {
  const rows = mergeRunLog([run("lost", 1_000), run("blank", 2_000, { empty: true, length: 0 })], {}, new Set());
  assert.deepEqual(
    rows.map((r) => [r.id, r.status]),
    [
      ["blank", "empty"],
      ["lost", "no_trace"],
    ],
  );
});

test("a stored result wins over still being queued, and the list is capped", () => {
  const rows = mergeRunLog([run("a", 1_000)], { a: { outcome: "waiting", at: new Date(2_000).toISOString() } }, new Set(["a"]));
  assert.equal(rows[0].status, "waiting");
  const many = Array.from({ length: 30 }, (_, i) => run(`m${i}`, i * 1000));
  assert.equal(mergeRunLog(many, {}, new Set()).length, 20);
  assert.equal(mergeRunLog(many, {}, new Set(), 5)[0].id, "m29");
});

test("every status has words", () => {
  for (const s of ["saved", "already_had", "skipped", "unreadable", "empty", "waiting", "queued", "no_trace"] as const) {
    assert.ok(describeRunStatus(s).length > 0);
  }
});
