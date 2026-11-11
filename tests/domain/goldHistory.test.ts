import { test } from "node:test";
import assert from "node:assert/strict";
import { goldHistoryRows, parseGoldHistory } from "../../src/domain/goldHistory";

// The shape /api/gold-history serves.
const SERVED = [
  { date: "2026-11-04", price22k: 12801, price24k: 13965, unit: "INR_PER_GRAM" },
  { date: "2026-11-03", price22k: 12800, price24k: 13964, unit: "INR_PER_GRAM" },
  { date: "2026-11-02", price22k: 12850, price24k: 14010, unit: "INR_PER_GRAM" },
];

test("the served history is read newest first, and rows that do not look right are skipped", () => {
  const rows = parseGoldHistory([SERVED[1], SERVED[0], { date: "bad", price22k: 1, price24k: 2 }, { date: "2026-11-01", price22k: "12800", price24k: 13900 }, null, "x"]);
  assert.deepEqual(rows.map((r) => r.date), ["2026-11-04", "2026-11-03"]);
  assert.deepEqual(rows[0], { date: "2026-11-04", price22k: 12801, price24k: 13965 });
  assert.deepEqual(parseGoldHistory({ error: "No gold history stored yet" }), []);
  assert.deepEqual(parseGoldHistory(null), []);
});

test("each table row shows its change from the day before, and the oldest has none", () => {
  const rows = goldHistoryRows(parseGoldHistory(SERVED));
  assert.deepEqual(rows.map((r) => r.date), ["2026-11-04", "2026-11-03", "2026-11-02"]);
  assert.equal(rows[0].price22k.value, 12801);
  assert.equal(rows[0].price22k.change?.direction, "up");
  assert.equal(rows[0].price22k.change?.amount, 1);
  assert.equal(rows[0].price24k.change?.amount, 1);
  assert.equal(rows[1].price22k.change?.direction, "down");
  assert.equal(rows[1].price22k.change?.amount, -50);
  assert.equal(rows[2].price22k.change, null);
  assert.equal(rows[2].price24k.change, null);
  assert.deepEqual(goldHistoryRows([]), []);
});
