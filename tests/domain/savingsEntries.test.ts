import { test } from "node:test";
import assert from "node:assert/strict";
import { entryKey, entryText, freeKey, pairBuys, placeNotes, emptyPlaceResult, type ExistingEntry } from "../../src/domain/savingsEntries";

const entry = (id: string, amountPaise: number, over: Partial<ExistingEntry> = {}): ExistingEntry => ({ id, key: `k-${id}`, amountPaise, deleted: false, edited: false, ...over });

test("a purchase pairs with the entry whose amount is closest, within a rupee", () => {
  const { matched, unmatched } = pairBuys([{ amountPaise: 600000 }], [entry("far", 600090), entry("near", 600010)]);
  assert.deepEqual(matched.map((m) => m.entry.id), ["near"]);
  assert.deepEqual(unmatched, []);
});

test("an amount more than a rupee apart is a different purchase", () => {
  const { matched, unmatched } = pairBuys([{ amountPaise: 600000 }], [entry("a", 600101)]);
  assert.equal(matched.length, 0);
  assert.deepEqual(unmatched, [0]);
});

test("two identical purchases take two entries, and a third has none", () => {
  const { matched, unmatched } = pairBuys([{ amountPaise: 600000 }, { amountPaise: 600000 }, { amountPaise: 600000 }], [entry("a", 600000), entry("b", 600000)]);
  assert.deepEqual(matched.map((m) => m.entry.id).sort(), ["a", "b"]);
  assert.deepEqual(unmatched, [2]);
});

test("the next free key for a fund, day and amount counts up", () => {
  const first = entryKey("INF1", "2026-11-05", 600000, 1);
  assert.equal(first, "sip|INF1|2026-11-05|600000|1");
  assert.equal(freeKey("INF1", "2026-11-05", 600000, new Set()), first);
  assert.equal(freeKey("INF1", "2026-11-05", 600000, new Set([first])), entryKey("INF1", "2026-11-05", 600000, 2));
});

test("the payee is the fund's short name", () => {
  assert.equal(entryText({ isin: "INF1", name: "Axis ELSS Tax Saver Fund - Regular Growth" }).payee, "Axis ELSS Tax Saver Fund");
  assert.equal(entryText({ isin: "INF1", name: "" }).payee, "INF1");
});

test("the notes say what was added or corrected and what could not be placed, and say nothing when there is nothing", () => {
  assert.deepEqual(placeNotes(emptyPlaceResult()), []);
  assert.deepEqual(placeNotes({ ...emptyPlaceResult(), added: 1, noGroup: 4 }), ["Added 1 mutual fund entry to your month group."]);
  const text = placeNotes({ ...emptyPlaceResult(), added: 2, updated: 1 }).join(" ");
  assert.match(text, /Added 2 mutual fund entries/);
  assert.match(text, /Corrected the amount of 1 mutual fund entry/);
});
