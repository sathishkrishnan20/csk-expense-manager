import { test } from "node:test";
import assert from "node:assert/strict";
import { NpsStatementError, isNpsStatement, parseNpsStatement } from "../../src/domain/npsStatement";

// The layout of a Protean NPS transaction statement, with invented figures: two schemes worth 70,000 and 30,000, and employer contributions of 10,000
// for May and August (the August row's date is split over three lines, as the real statement does when it does not fit).
const statement = (over: Record<string, string> = {}): string[] => [
  "NPS TRANSACTION | | STATEMENT",
  "| April 01, 2026 | | to | | November 13, 2026",
  "NPS Transaction Statement for",
  over.tier ?? "Tier I Account",
  "PRAN | | 123456789012 | | Registration Date | | 09-Jun-26",
  "Investment Summary",
  "Contributions | | on | | Investment | | 6.50%",
  "₹ | | 1,00,000.00 | | 12 | | ₹ | | 90,000.00 | | ₹ | | 0.00 | | ₹ | | 10,000.00 | | ₹ 10.00",
  "Investment Details - Scheme Wise Summary",
  "Holdings(Invest | | NAV as on 12-Nov-2026 ( N",
  "TEST PENSION FUND SCHEME E - TIER I POP | | 70,000.00 | | 1,000.0000 | | 70.0000",
  over.scheme ?? "TEST PENSION FUND SCHEME G - TIER I POP | | 30,000.00 | | 1,000.0000 | | 30.0000",
  "In case of debit of units arising from PFM/Scheme Preference Change, Rebalancing, Shifting, etc., units may | | be temporarily",
  "Contribution/Redemption Details during the selected period",
  "| Date | | Particulars | | Uploaded By | | Employee | | Employer's | | Total",
  "| 24-Jun-2026 | | For May, 2026 | | Test Employer (1), | | 0.00 | | 10,000.00 | | 10,000.00",
  "| 01-Sep-",
  "For August, 2026 | | Test Employer (1), | | 0.00 | | 10,000.00 | | 10,000.00",
  "| 2026 |",
  "Transaction Details",
  "ICICI | 05-Oct-2026 | By Contribution for September,2026 | 9,999.00 | 70.0000 | 142.8429",
];

test("a statement is recognised and read: PRAN, period, value, contributed, return, scheme units and each month's contribution", () => {
  const lines = statement();
  assert.ok(isNpsStatement(lines));
  const s = parseNpsStatement(lines);
  assert.equal(s.pran, "123456789012");
  assert.equal(s.periodStart, "2026-04-01");
  assert.equal(s.periodEnd, "2026-11-13");
  assert.equal(s.navDate, "2026-11-12");
  assert.equal(s.valuePaise, 10000000);
  assert.equal(s.contributedPaise, 9000000);
  assert.equal(s.xirr, "6.50");
  assert.deepEqual(
    s.holdings.map((h) => [h.name, h.unitsE4, h.navE4, h.valuePaise]),
    [
      ["TEST PENSION FUND SCHEME E - TIER I POP", 10000000, 700000, 7000000],
      ["TEST PENSION FUND SCHEME G - TIER I POP", 10000000, 300000, 3000000],
    ],
  );
  assert.deepEqual(
    s.contributions.map((c) => [c.month, c.creditedDate, c.ownPaise, c.employerPaise]),
    [
      ["2026-05", "2026-06-24", 0, 1000000],
      ["2026-08", "2026-09-01", 0, 1000000],
    ],
  );
});

test("schemes that do not add up to the account's value are refused", () => {
  assert.throws(() => parseNpsStatement(statement({ scheme: "TEST PENSION FUND SCHEME G - TIER I POP | | 20,000.00 | | 1,000.0000 | | 20.0000" })), /do not add up/);
});

test("units and NAV that do not give the printed value are refused", () => {
  assert.throws(() => parseNpsStatement(statement({ scheme: "TEST PENSION FUND SCHEME G - TIER I POP | | 30,000.00 | | 1,000.0000 | | 31.0000" })), /do not give its printed value/);
});

test("a Tier II statement is not read", () => {
  assert.throws(() => parseNpsStatement(statement({ tier: "Tier II Account" })), /Tier II/);
});

test("something that is not an NPS statement is not read", () => {
  assert.ok(!isNpsStatement(["Account statement"]));
  assert.throws(() => parseNpsStatement(["NPS TRANSACTION | | STATEMENT"]), NpsStatementError);
});
