import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDuplicates, futureDateWarning, shiftMonths, type DuplicateSource } from "../../src/domain/duplicate";

const row = (over: Partial<DuplicateSource> = {}): DuplicateSource => ({
  id: "m-1",
  txnDate: "2026-10-05",
  direction: "debit",
  amountPaise: 1200000,
  category: "Home",
  subcategory: "Rent",
  payee: "Landlord",
  paymentMethod: "UPI",
  description: "Room rent",
  classifiedBy: "manual",
  ...over,
});

test("shiftMonths keeps the day, or the month's last day when it does not exist", () => {
  assert.equal(shiftMonths("2026-10-05", 1), "2026-11-05");
  assert.equal(shiftMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(shiftMonths("2028-01-31", 1), "2028-02-29"); // leap year
  assert.equal(shiftMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(shiftMonths("2026-10-05", 12), "2027-10-05");
  assert.equal(shiftMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(shiftMonths("2026-01-15", -2), "2025-11-15");
});

test("a copy keeps the readable fields and lands in the chosen group", () => {
  const [d] = buildDuplicates([row()], { mode: "shift", months: 1 }, "g-abc");
  assert.deepEqual(d, {
    sourceId: "m-1",
    label: "Landlord",
    txnDate: "2026-11-05",
    direction: "debit",
    amountPaise: 1200000,
    category: "Home",
    subcategory: "Rent",
    payee: "Landlord",
    paymentMethod: "UPI",
    description: "Room rent",
    categoriseLater: false,
    groupId: "g-abc",
  });
});

test("one date for all, each row in order", () => {
  const drafts = buildDuplicates([row({ id: "a", txnDate: "2026-10-01" }), row({ id: "b", txnDate: "2026-10-20" })], { mode: "date", date: "2026-12-01" }, "main");
  assert.deepEqual(drafts.map((d) => [d.sourceId, d.txnDate]), [["a", "2026-12-01"], ["b", "2026-12-01"]]);
});

test("rows the AI never placed are left for Re-classify instead of copying a placeholder", () => {
  const rule = { mode: "shift", months: 1 } as const;
  const pending = buildDuplicates([row({ classifiedBy: "pending", category: "Others", subcategory: "Uncategorised" })], rule, "main")[0];
  const fallback = buildDuplicates([row({ category: "Others", subcategory: "Uncategorised" })], rule, "main")[0];
  const unresolved = buildDuplicates([row({ classifiedBy: "unresolved" })], rule, "main")[0];
  for (const d of [pending, fallback, unresolved]) {
    assert.equal(d.categoriseLater, true);
    assert.equal(d.category, "");
    assert.equal(d.subcategory, "");
  }
  // A credit in Income : Others is a real category, not a placeholder.
  const credit = buildDuplicates([row({ direction: "credit", category: "Income", subcategory: "Others" })], rule, "main")[0];
  assert.equal(credit.categoriseLater, false);
  assert.equal(credit.category, "Income");
});

test("label falls back to the description, then the category; a missing payee becomes empty", () => {
  const rule = { mode: "shift", months: 1 } as const;
  assert.equal(buildDuplicates([row({ payee: null })], rule, "main")[0].label, "Room rent");
  assert.equal(buildDuplicates([row({ payee: null, description: null })], rule, "main")[0].label, "Home : Rent");
  assert.equal(buildDuplicates([row({ payee: null })], rule, "main")[0].payee, "");
});

test("future-dated copies in Main are flagged, in a group or in the past they are not", () => {
  const rule = { mode: "date", date: "2026-12-01" } as const;
  const inMain = buildDuplicates([row()], rule, "main");
  assert.match(futureDateWarning(inMain, "main", "2026-11-20") ?? "", /counted twice/);
  assert.equal(futureDateWarning(inMain, "main", "2026-12-01"), null);
  assert.equal(futureDateWarning(buildDuplicates([row()], rule, "g-abc"), "g-abc", "2026-11-20"), null);
});
