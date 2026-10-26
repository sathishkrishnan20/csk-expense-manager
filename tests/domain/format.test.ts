import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatFieldDate,
  formatLongDate,
  formatRupees,
  fromISODate,
  monthRange,
  parseAmountInput,
  toISODate,
} from "../../src/domain/format";

test("rupees use Indian grouping and two decimals", () => {
  assert.equal(formatRupees(135500), "₹1,355.00");
  assert.equal(formatRupees(5), "₹0.05");
  assert.equal(formatRupees(0), "₹0.00");
  assert.equal(formatRupees(12345678), "₹1,23,456.78");
  assert.equal(formatRupees(123456789012), "₹1,23,45,67,890.12");
  assert.equal(formatRupees(-4565435), "-₹45,654.35");
});

test("dates", () => {
  assert.equal(formatLongDate("2026-03-19"), "March 19, 2026");
  assert.equal(formatLongDate("2026-10-05"), "October 05, 2026");
  assert.equal(formatFieldDate("2026-10-25"), "10/25/2026");
  assert.equal(toISODate(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(toISODate(fromISODate("2026-12-31")), "2026-12-31");
  assert.deepEqual(monthRange(new Date(2026, 9, 25)), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(monthRange(new Date(2028, 1, 10)), { start: "2028-02-01", end: "2028-02-29" });
});

test("amount input", () => {
  assert.equal(parseAmountInput("1,234.5"), 123450);
  assert.equal(parseAmountInput("378"), 37800);
  assert.equal(parseAmountInput("0.1"), 10);
  assert.equal(parseAmountInput("0"), null);
  assert.equal(parseAmountInput(""), null);
  assert.equal(parseAmountInput("abc"), null);
  assert.equal(parseAmountInput("-5"), null);
  assert.equal(parseAmountInput("12.345"), null);
});
