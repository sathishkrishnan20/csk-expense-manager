import { test } from "node:test";
import assert from "node:assert/strict";
import { MfCasError, isMfCas, parseMfCas } from "../../src/domain/mfCas";

// The mutual fund part of a CDSL consolidated statement, with invented funds and figures: a SIP of 4,999.70 + 0.30 stamp duty into Alpha, a switch-in and a
// redemption in Beta (neither is new money). The lines are what the PDF reader gives, wrapped descriptions included.
const cas = (over: Record<string, string> = {}): string[] => [
  "CONSOLIDATED ACCOUNT STATEMENT (CAS) FOR SECURITIES HELD IN DEMAT",
  "STATEMENT OF TRANSACTIONS FOR THE PERIOD FROM 01-10-2026 TO 31-10-2026 | | 01-10-2026 से",
  "| MUTUAL FUND UNITS HELD WITH MF/RTA | |",
  "TEST - Alpha Equity Fund - Regular Growth",
  "| ISIN : | | INF000A01001 | | UCC : | | MFTEST0001",
  "| Opening Balance | | 100.000",
  "Systematic Investment (1/1)",
  "| 05-10-2026 | | 4999.7 | | 50.0000 | | 50.0000 | | 100.000 | | .3 | | 0 | | 0",
  "12345 |",
  "| Closing Balance | | 200.000",
  "TESTB - Beta Balanced Fund - Growth",
  "| ISIN : | | INF000B01002 | | UCC : | | MFTEST0002",
  "| Opening Balance | | 10.000",
  "Switch In - from Alpha",
  "| 06-10-2026 | | 1000.00 | | 100.0000 | | 100.0000 | | 10.000 | | 0 | | 0 | | 0",
  "Redemption",
  "| 07-10-2026 | | (1000.00) | | 100.0000 | | 100.0000 | | (10.000) | | 0 | | 0 | | 0",
  "| Closing Balance | | 10.000",
  "| MUTUAL FUND UNITS HELD AS ON 31-10-2026 | |",
  "| TEST - Alpha | INF000A01001 | | 111/1 | | 200.000 | | 50.0000 | | 10,000.00 | | 10,000.00 | | 0.00 | | 0.00",
  "| TESTB - Beta | INF000B01002 | | 222 | | 10.000 | | 100.0000 | | 1,000.00 | | 1,000.00 | | 0.00 | | 0.00",
  over.grand ?? "| Grand Total | | 11,000.00 | | 11,000.00",
];

test("a CAS is recognised and read: period, each fund's units, NAV, invested and value, and the purchases", () => {
  const lines = cas();
  assert.ok(isMfCas(lines));
  const c = parseMfCas(lines);
  assert.equal(c.periodStart, "2026-10-01");
  assert.equal(c.periodEnd, "2026-10-31");
  assert.equal(c.valuationDate, "2026-10-31");
  assert.deepEqual(
    c.holdings.map((h) => [h.isin, h.folio, h.name, h.unitsE4, h.navE4, h.investedPaise, h.valuePaise]),
    [
      ["INF000A01001", "111/1", "Alpha Equity Fund - Regular Growth", 2000000, 500000, 1000000, 1000000],
      ["INF000B01002", "222", "Beta Balanced Fund - Growth", 100000, 1000000, 100000, 100000],
    ],
  );
});

test("a purchase is the amount plus its stamp duty; a switch-in and a redemption are not purchases", () => {
  const c = parseMfCas(cas());
  assert.deepEqual(c.purchases, [{ date: "2026-10-05", isin: "INF000A01001", amountPaise: 500000 }]);
});

test("funds that do not add up to the statement's grand total are refused", () => {
  assert.throws(() => parseMfCas(cas({ grand: "| Grand Total | | 11,000.00 | | 99,000.00" })), /do not add up/);
});

test("a PDF with no mutual fund section is not read as a CAS", () => {
  assert.ok(!isMfCas(["Account statement"]));
  assert.throws(() => parseMfCas(["CONSOLIDATED ACCOUNT STATEMENT"]), MfCasError);
});
