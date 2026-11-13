import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseFolio, readSipPdf, readSipText, resolveFund, sameUnits } from "../../src/domain/fundMail";

// Lines in the layouts of the four fund-house statements and the two confirmation emails that are read, with invented funds and numbers.
const AXIS = [
  "| FOLIO NUMBER : | | 123456789012 | | CAN : | | Statement Date : 07 Nov 2026",
  'Alpha ELSS Fund - Regular Growth( AL-GP) (Non - Demat) | | <font size="2">Alpha ELSS Fund</font> | | ISIN : INF000A01001 | | N',
  "Net Systematic Investment-Channel | | 05/06/2026 | | 91.333100 | | 05/06/2026 | | 5,999.70 | | 91.333100 | | 65.690 | | 3,574.095",
  "| Opening Balance | | 06/07/2026",
  "| Stamp Duty | | 06/07/2026 | | 0.30",
  "Net Systematic Investment-Channel | | 06/07/2026 | | 96.944200 | | 06/07/2026 | | 5,999.70 | | 96.944200 | | 61.888 | | 3,635.983",
  "Partner (48/60)",
  "Redemption-Channel | | 08/07/2026 | | 96.000000 | | 08/07/2026 | | 1,000.00 | | 96.000000 | | 10.417 | | 3,625.566",
  "Gross Systematic Investment-Channel | | 05/11/2026 | | 05/11/2026 | | 6,000.00",
  "| Stamp Duty | | 05/11/2026 | | 0.30",
  "Net Systematic Investment-Channel | | 05/11/2026 | | 98.922000 | | 05/11/2026 | | 5,999.70 | | 98.922000 | | 60.651 | | 3,683.266",
];
const MIRAE = [
  "Folio No. 1234 5678 901 | | CAN : | | Statement Date : 14 Oct 2026",
  "ISIN : INF000B01002 | | Balance Units : 5352.522",
  "10/07/2026 | | Gross Systematic Investment(NAV Dt : 10/07/2026) | | 5,000.00",
  "Stamp Duty | | 0.25",
  "Net Systematic Investment(NAV Dt : 10/07/2026) - 285257094 | | 4,999.75 | | 50.8250 | | 50.825 | | 98.372 | | 5,048.113",
];
const NIPPON = [
  "| Account / Folio No : 499000000001",
  "NIPPON GOLD FUND - IDCW PLAN REINVESTMENT ( GDDPR) ISIN : INF000C01003 (NON-DEMAT)",
  "| 09/10/2026 | | Opening Balance | | 3,441.535",
  "| 09/11/2026 | | Sys. Investment (Gross - Rs 10000.00 ,Stamp duty Rs 0.50 ) | | 9,999.50 | | 53.7115 | | 186.171 | | 3,627.706",
];
const SBI = [
  "FOLIO NUMBER : 42000001",
  "| L055A SBI TEST INDEX FUND - REGULAR PLAN - GROWTH | | ISIN CODE : INF000D01004",
  "| Opening Balance | | 447.574",
  "| 05-Nov-2026 | | Purchase- Systematic Instalment No - 25/902-Channel | | 3,999.80 | | 218.3285 | | 218.3285 | | 18.320 | | 465.894",
  "| Gross Amount: Rs.4000/-; Stamp Duty Charges Levied | | 0.20",
];

const summary = (rows: ReturnType<typeof readSipPdf>) => rows.map((r) => [r.isin, r.folio, r.date, r.unitsE4, r.netPaise, r.stampPaise]);

test("Axis: each net instalment is read with its date, units, net amount and stamp duty; a redemption is not a purchase", () => {
  assert.deepEqual(summary(readSipPdf(AXIS)), [
    ["INF000A01001", "123456789012", "2026-06-05", 656900, 599970, 30], // no stamp line printed: worked out as 0.005% of the gross
    ["INF000A01001", "123456789012", "2026-07-06", 618880, 599970, 30],
    ["INF000A01001", "123456789012", "2026-11-05", 606510, 599970, 30],
  ]);
  assert.equal(readSipPdf(AXIS)[2].navE4, 989220);
});

test("Mirae Asset: the date is in the description and the stamp duty is on the line before", () => {
  assert.deepEqual(summary(readSipPdf(MIRAE)), [["INF000B01002", "12345678901", "2026-07-10", 983720, 499975, 25]]);
});

test("Nippon India: one line with the date first and the stamp duty in the description", () => {
  assert.deepEqual(summary(readSipPdf(NIPPON)), [["INF000C01003", "499000000001", "2026-11-09", 1861710, 999950, 50]]);
});

test("SBI (CAMS): the stamp duty is on the line after the instalment", () => {
  assert.deepEqual(summary(readSipPdf(SBI)), [["INF000D01004", "42000001", "2026-11-05", 183200, 399980, 20]]);
});

test("a PDF that is none of these has no purchases", () => {
  assert.deepEqual(readSipPdf(["Account statement", "nothing here", "ISIN : INF000A01001", "05/11/2026 | Redemption | 1,000.00 | 50.0000 | 20.000 | 100.000"]), []);
});

// What the savings inbox keeps of the two emails (text, with the cells of ICICI's table one after another).
const ICICI_TEXT =
  "Dear Investor, Greetings from ICICI Prudential Mutual Fund! The allotment details for your transaction are furnished below:\nFolio No\n55555555\nScheme Name\nICICI Prudential Test Index Fund - Growth\nAmount(Rs.)\n5,000.00\nStamp Duty(Rs.)\n0.25\nNet Amount (Rs.)\n4,999.75\nValue Date\n09-Nov-2026\nNet Asset Value (Rs.)\n63.9751\nUnits\n78.151\nPlease Click here to view your Smart statement.";
const KOTAK_TEXT =
  "Dear Investor, Thank you for your investment in Kotak Mutual fund!\nYour purchase request in Kotak Test Tax Saver Fund - Growth (Regular Plan) for Rs. 4,999.75 has been processed at the NAV of 118.998 on 05-Nov-2026 for 42.015 Units.";

test("ICICI Prudential's email: the table gives the folio, scheme, amounts, date, NAV and units", () => {
  const p = readSipText("Folio 55555555 - Processing of systematic Purchase in ICICI Prudential Mutual Fund", ICICI_TEXT);
  assert.deepEqual(
    p && [p.isin, p.folio, p.name, p.date, p.unitsE4, p.netPaise, p.stampPaise, p.navE4],
    [null, "55555555", "ICICI Prudential Test Index Fund - Growth", "2026-11-09", 781510, 499975, 25, 639751],
  );
});

test("Kotak's email: one sentence, with the folio taken from the subject and the stamp duty worked out", () => {
  const p = readSipText("Folio 10798071 - Processing of Purchase in Kotak Mutual Fund", KOTAK_TEXT);
  assert.deepEqual(
    p && [p.isin, p.folio, p.name, p.date, p.unitsE4, p.netPaise, p.stampPaise, p.navE4],
    [null, "10798071", "Kotak Test Tax Saver Fund - Growth (Regular Plan)", "2026-11-05", 420150, 499975, 25, 1189980],
  );
});

test("an email that is not a purchase confirmation, or a redemption, is not read", () => {
  assert.equal(readSipText("Hello", "Your statement is attached."), null);
  assert.equal(readSipText("Folio 1 - x", "Your purchase request in Some Fund - Redemption for Rs. 1,000.00 has been processed at the NAV of 10.000 on 05-Nov-2026 for 100.000 Units."), null);
});

const FUNDS = [
  { code: "INF000A01001", account: "123456789012/0", name: "Alpha ELSS Fund" },
  { code: "INF000B01002", account: "12345678901/0", name: "Beta Fund" },
  { code: "INF000E01005", account: "55555555/25", name: "ICICI Prudential Test Index Fund - Growth" },
  { code: "INF000F01006", account: "10798071", name: "Kotak Test Tax Saver Fund - Growth (Regular Plan)" },
];

test("a purchase is matched to a fund of the CAS by ISIN, then by folio number (without the check digit), then by name", () => {
  assert.equal(resolveFund({ isin: "INF000A01001", folio: null, name: null }, FUNDS)?.name, "Alpha ELSS Fund");
  assert.equal(resolveFund({ isin: null, folio: "55555555", name: null }, FUNDS)?.code, "INF000E01005");
  assert.equal(resolveFund({ isin: null, folio: "1234 5678 901", name: null }, FUNDS)?.code, "INF000B01002");
  assert.equal(resolveFund({ isin: null, folio: null, name: "kotak test tax saver fund - growth (regular plan)" }, FUNDS)?.code, "INF000F01006");
  assert.equal(resolveFund({ isin: null, folio: "999", name: null }, FUNDS), null);
  assert.equal(normaliseFolio("910157128972/0"), "910157128972");
  assert.equal(normaliseFolio("9101 5712 8972"), "910157128972");
});

test("a name or folio that fits more than one fund is not guessed", () => {
  const twins = [
    { code: "INF1", account: "777/1", name: "Same Fund" },
    { code: "INF2", account: "777/2", name: "Other Fund" },
  ];
  assert.equal(resolveFund({ isin: null, folio: "777", name: null }, twins), null);
  assert.equal(resolveFund({ isin: null, folio: "777", name: "Other Fund" }, twins)?.code, "INF2");
  assert.equal(resolveFund({ isin: null, folio: null, name: "Same Fund" }, [...twins, { code: "INF3", account: "9", name: "Same Fund" }]), null);
});

test("two purchases agree on units to the last digit printed", () => {
  assert.ok(sameUnits(606510, 606510));
  assert.ok(sameUnits(606510, 606500));
  assert.ok(!sameUnits(606510, 606400));
});

// The same two emails forwarded by hand from Gmail: its plain-text version wraps the values in asterisks, adds <links> and breaks long lines.
test("a hand-forwarded copy, with Gmail's asterisks, link markers and broken lines, reads the same as the original", () => {
  const kotak =
    "---------- Forwarded message ---------\nDear *Sathish Krishnan,*\n\nThank you for your investment in Kotak Mutual fund!\n\nYour purchase request in *Kotak Test Tax Saver Fund - Growth (Regular Plan)*\nfor Rs.*4,999.75* has been processed at the NAV of *118.998* on\n*05-Nov-2026* for *42.015* Units.\n\nSay *'Hi'* to us on <https://wa.me/1>\n";
  const p = readSipText("Fwd: Folio 10798071 - Processing of Purchase in Kotak Mutual Fund", kotak);
  assert.deepEqual(p && [p.folio, p.name, p.date, p.unitsE4, p.netPaise], ["10798071", "Kotak Test Tax Saver Fund - Growth (Regular Plan)", "2026-11-05", 420150, 499975]);

  const icici =
    "Greetings from ICICI Prudential Mutual Fund! The allotment details are furnished below:\nFolio No *55555555*\nScheme Name *ICICI Prudential Test Index Fund - Growth*\nAmount(Rs.) *5,000.00*\nStamp Duty(Rs.) *0.25*\nNet Amount (Rs.) *4,999.75*\nValue Date *09-Nov-2026*\nNet Asset Value (Rs.) *63.9751*\nUnits *78.151*\n\nPlease Click here\n<https://digital.example.com/SMARTSOA/P_E_1E5B>\nto view your Smart statement.";
  const q = readSipText("Fwd: Folio 55555555 - Processing of systematic Purchase in ICICI Prudential Mutual Fund", icici);
  assert.deepEqual(q && [q.folio, q.name, q.date, q.unitsE4, q.netPaise, q.stampPaise], ["55555555", "ICICI Prudential Test Index Fund - Growth", "2026-11-09", 781510, 499975, 25]);
});
