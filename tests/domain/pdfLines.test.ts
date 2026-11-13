import { test } from "node:test";
import assert from "node:assert/strict";
import { isNumberCell, isoFromPrinted, monthFromWords, normaliseLine, parseScaled, pdfLines } from "../../src/domain/pdfLines";

test("a line is its pieces joined by one cell border, with nothing at the ends", () => {
  assert.equal(normaliseLine("| Mar-2026 01-04-2026 | | CR | | 1,87,500 |"), "Mar-2026 01-04-2026 | CR | 1,87,500");
  assert.equal(normaliseLine("202604 |"), "202604");
  assert.equal(normaliseLine("   "), "");
});

test("pieces on the same baseline are one line, left to right; the page's lines run top to bottom", () => {
  const lines = pdfLines([
    [
      { text: "B", x: 50, y: 700.4, width: 5 },
      { text: "A", x: 10, y: 700, width: 5 },
      { text: "lower", x: 10, y: 600, width: 20 },
      { text: " ", x: 30, y: 600, width: 2 },
    ],
  ]);
  assert.deepEqual(lines, ["A | B", "lower"]);
});

test("numbers are read as text into integers, never through floating point", () => {
  assert.equal(parseScaled("1,87,500", 2), 18750000);
  assert.equal(parseScaled("5999.7", 2), 599970);
  assert.equal(parseScaled(".3", 2), 30);
  assert.equal(parseScaled("(32.77)", 2), -3277);
  assert.equal(parseScaled("-2,489.56", 2), -248956);
  assert.equal(parseScaled("₹ 44.25", 2), 4425);
  assert.equal(parseScaled("4,068.7055", 4), 40687055);
  assert.equal(parseScaled("93.7131", 4), 937131);
  assert.equal(parseScaled("3822.615", 4), 38226150);
  assert.equal(parseScaled("0.125", 2), 13, "past the scale it rounds");
  assert.equal(parseScaled("abc", 2), null);
  assert.equal(parseScaled("", 2), null);
  assert.equal(parseScaled("1.2.3", 2), null);
});

test("what counts as a number cell", () => {
  for (const ok of ["0", "5999.7", ".3", "1,87,500", "(10.000)", "-4.36"]) assert.ok(isNumberCell(ok), ok);
  for (const no of ["INF846K01131", "24/121 Distributor", "", "05-10-2026"]) assert.ok(!isNumberCell(no), no);
});

test("dates in the statements' own forms", () => {
  assert.equal(isoFromPrinted("13-11-2026"), "2026-11-13");
  assert.equal(isoFromPrinted("01/04/2026"), "2026-04-01");
  assert.equal(isoFromPrinted("12-Nov-2026"), "2026-11-12");
  assert.equal(isoFromPrinted("09-Jun-26"), "2026-06-09");
  assert.equal(isoFromPrinted("not a date"), null);
  assert.equal(isoFromPrinted("32-13-2026"), null);
  assert.equal(monthFromWords("Mar-2026"), "2026-03");
  assert.equal(monthFromWords("March, 2026"), "2026-03");
  assert.equal(monthFromWords("Foo-2026"), null);
});
