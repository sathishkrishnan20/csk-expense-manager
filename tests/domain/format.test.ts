import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatClockTime,
  formatFieldDate,
  formatLongDate,
  formatRelativeTime,
  formatRupeeAmount,
  formatRupees,
  formatShortDate,
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

test("rupee amounts (rates) in whole rupees with chosen decimals", () => {
  assert.equal(formatRupeeAmount(126020), "₹1,26,020");
  assert.equal(formatRupeeAmount(177300), "₹1,77,300");
  assert.equal(formatRupeeAmount(999), "₹999");
  assert.equal(formatRupeeAmount(13757.6, { max: 1 }), "₹13,757.6");
  assert.equal(formatRupeeAmount(12602, { max: 1 }), "₹12,602");
  assert.equal(formatRupeeAmount(177.3, { min: 2 }), "₹177.30");
  assert.equal(formatRupeeAmount(110060.8, { max: 1 }), "₹1,10,060.8");
  assert.equal(formatRupeeAmount(2780.4), "₹2,780");
  assert.equal(formatRupeeAmount(-54.2, { max: 1 }), "-₹54.2");
  assert.equal(formatRupeeAmount(-0.04, { max: 1 }), "₹0");
});

test("short dates, clock times and how long ago", () => {
  assert.equal(formatShortDate("2026-11-03"), "03 Nov");
  assert.equal(formatClockTime(new Date(2026, 10, 3, 15, 42)), "3:42 PM");
  assert.equal(formatClockTime(new Date(2026, 10, 3, 0, 5)), "12:05 AM");
  assert.equal(formatClockTime(new Date(2026, 10, 3, 12, 0)), "12:00 PM");

  const now = Date.UTC(2026, 10, 4, 12, 0);
  const ago = (ms: number) => formatRelativeTime(now - ms, now);
  assert.equal(ago(20_000), "just now");
  assert.equal(ago(12 * 60_000), "12 min ago");
  assert.equal(ago(3 * 3_600_000 + 5 * 60_000), "3 hr ago");
  assert.equal(ago(24 * 3_600_000), "1 day ago");
  assert.equal(ago(50 * 3_600_000), "2 days ago");
  assert.equal(ago(-5 * 60_000), "just now");
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
