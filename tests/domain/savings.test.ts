import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideMonth,
  describeImport,
  estimateMonths,
  formatNav,
  fundDisplay,
  npsSchemeDisplay,
  gainOf,
  gainText,
  schemeLabel,
  formatUnits,
  holdingInvested,
  holdingTotals,
  holdingUnits,
  holdingValue,
  lastDayOfMonth,
  looksActive,
  monthLines,
  monthsBetween,
  monthsFullyCovered,
  summarise,
  toggledAutoAdd,
  usualAmounts,
  valuePaiseOf,
  wholeRupees,
  type MonthRow,
  type SavingsAccount,
  type SavingsHolding,
} from "../../src/domain/savings";

const row = (over: Partial<MonthRow> = {}): MonthRow => ({
  kind: "pf", account: "A", month: "2026-10", ownPaise: 100, employerPaise: 100, pensionPaise: 0, source: "statement", creditedDate: "2026-11-01", ...over,
});
const account = (over: Partial<SavingsAccount> = {}): SavingsAccount => ({
  kind: "pf", account: "A", label: null, status: "ACTIVE", asOf: "2026-11-13", fy: 2026, valuePaise: null, investedPaise: null, xirr: null,
  ownPaise: 1000, employerPaise: 2000, pensionPaise: 0, autoAdd: true, autoFrom: "2026-10", estOwnPaise: 100, estEmployerPaise: 100, estPensionPaise: 0, ...over,
});
const holding = (over: Partial<SavingsHolding> = {}): SavingsHolding => ({
  kind: "mf", account: "F1", code: "INF000A01001", name: "Alpha", unitsE4: 2000000, navE4: 500000, valuePaise: 1000000, investedPaise: 800000, asOf: "2026-10-31",
  navDate: "2026-10-31", liveNavE4: null, liveNavDate: null, ...over,
});

test("month arithmetic", () => {
  assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
  assert.equal(lastDayOfMonth("2028-02"), "2028-02-29");
  assert.deepEqual(monthsBetween("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthsBetween("2026-12", "2026-11"), []);
});

test("a statement covers the months from their first day to their last, and a part of a month is left to a later statement", () => {
  assert.deepEqual(monthsFullyCovered("2026-10-01", "2026-10-31"), ["2026-10"]);
  assert.deepEqual(monthsFullyCovered("2026-08-01", "2026-10-31"), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(monthsFullyCovered("2026-10-01", "2026-11-13"), ["2026-10"]);
  assert.deepEqual(monthsFullyCovered("2026-10-15", "2026-12-31"), ["2026-11", "2026-12"]);
  assert.deepEqual(monthsFullyCovered("2026-10-05", "2026-10-20"), []);
});

test("a statement's figure replaces an estimate, matches itself, and corrects an earlier statement", () => {
  assert.equal(decideMonth(undefined, row(), null), "add");
  assert.equal(decideMonth(row({ source: "estimate", creditedDate: null }), row(), null), "update");
  assert.equal(decideMonth(row(), row(), null), "same");
  assert.equal(decideMonth(row(), row({ ownPaise: 999 }), null), "update");
});

test("a statement that began after the earliest known credit cannot have all of the month, so the stored figure stays", () => {
  const stored = row({ creditedDate: "2026-11-01" });
  const partial = row({ ownPaise: 40 });
  assert.equal(decideMonth(stored, partial, "2026-11-10"), "keep");
  assert.equal(decideMonth(stored, partial, "2026-11-01"), "update");
  assert.equal(decideMonth(stored, partial, null), "update");
});

test("estimates start the month the switch was turned on, fill every month since without a figure, and never reach back", () => {
  const now = new Date(2026, 10, 13); // 13 Nov 2026
  assert.deepEqual(estimateMonths(account({ autoFrom: "2026-10" }), new Set(), now), ["2026-10", "2026-11"]);
  assert.deepEqual(estimateMonths(account({ autoFrom: "2026-10" }), new Set(["2026-10"]), now), ["2026-11"]);
  assert.deepEqual(estimateMonths(account({ autoFrom: "2026-11" }), new Set(), now), ["2026-11"]);
  assert.deepEqual(estimateMonths(account({ autoAdd: false }), new Set(), now), []);
  assert.deepEqual(estimateMonths(account({ status: "CLOSED" }), new Set(), now), []);
  assert.deepEqual(estimateMonths(account({ autoFrom: null }), new Set(), now), []);
});

test("turning the switch on starts from this month, keeps an earlier start when it was already on, and off clears it", () => {
  const now = new Date(2026, 10, 13);
  assert.deepEqual(toggledAutoAdd({ autoAdd: false, autoFrom: null }, true, now), { autoAdd: true, autoFrom: "2026-11" });
  assert.deepEqual(toggledAutoAdd({ autoAdd: true, autoFrom: "2026-09" }, true, now), { autoAdd: true, autoFrom: "2026-09" });
  assert.deepEqual(toggledAutoAdd({ autoAdd: true, autoFrom: "2026-09" }, false, now), { autoAdd: false, autoFrom: null });
});

test("the usual amounts are the newest month's, and a PF account looks active when its passbook is recent", () => {
  assert.deepEqual(usualAmounts([{ month: "2026-08", ownPaise: 1, employerPaise: 2, pensionPaise: 0 }, { month: "2026-09", ownPaise: 5, employerPaise: 6, pensionPaise: 7 }]), { own: 5, employer: 6, pension: 7 });
  assert.deepEqual(usualAmounts([]), { own: 0, employer: 0, pension: 0 });
  assert.ok(looksActive("2026-09", "2026-11-13"));
  assert.ok(looksActive("2026-08", "2026-11-13"), "a deposit three months late still counts");
  assert.ok(!looksActive("2026-07", "2026-11-13"));
  assert.ok(!looksActive("2025-11", "2026-11-13"));
  assert.ok(!looksActive(null, "2026-11-13"));
});

test("the monthly list has one line per month, newest first, with each kind's total and whether PF is estimated", () => {
  const lines = monthLines([
    row({ month: "2026-10", ownPaise: 100, employerPaise: 100 }),
    row({ month: "2026-10", account: "B", ownPaise: 50, employerPaise: 0, pensionPaise: 0, source: "estimate" }),
    row({ kind: "nps", account: "N", month: "2026-10", ownPaise: 0, employerPaise: 300 }),
    row({ kind: "mf", account: "", month: "2026-10", ownPaise: 4100, employerPaise: 0 }),
    row({ month: "2026-09", ownPaise: 10, employerPaise: 10 }),
  ]);
  assert.deepEqual(lines.map((l) => l.month), ["2026-10", "2026-09"]);
  assert.deepEqual(lines[0], { month: "2026-10", mfPaise: 4100, npsPaise: 300, pfPaise: 250, totalPaise: 4650, pfEstimated: true });
  assert.equal(lines[1].pfEstimated, false);
});

test("value is units x NAV, and a newer NAV found online replaces the statement's value", () => {
  assert.equal(valuePaiseOf(2000000, 500000), 1000000); // 200 units x 50 = Rs 10,000
  assert.equal(valuePaiseOf(40687055, 768979), 31287491); // 4,068.7055 x 76.8979 = 3,12,874.905: rounded (a statement prints it cut off, ...90)
  assert.deepEqual(holdingValue(holding()), { valuePaise: 1000000, navE4: 500000, navDate: "2026-10-31", live: false });
  assert.deepEqual(holdingValue(holding({ liveNavE4: 600000, liveNavDate: "2026-11-12" })), { valuePaise: 1200000, navE4: 600000, navDate: "2026-11-12", live: true });
  assert.equal(holdingValue(holding({ liveNavE4: 600000, liveNavDate: "2026-10-31" })).live, false, "not newer than the statement's");
});

test("totals add up the holdings, and the summary adds MF, NPS and PF balances (pension apart)", () => {
  const holdings = [holding(), holding({ code: "INF000B01002", unitsE4: 1000000, navE4: 1000000, valuePaise: 1000000, investedPaise: 500000, liveNavE4: 1100000, liveNavDate: "2026-11-12" })];
  const totals = holdingTotals(holdings);
  assert.equal(totals.valuePaise, 1000000 + 1100000);
  assert.equal(totals.investedPaise, 1300000);
  assert.equal(totals.navDate, "2026-11-12");
  assert.equal(totals.live, true);

  const s = summarise({
    months: [row({ source: "estimate", ownPaise: 10, employerPaise: 20, pensionPaise: 5 })],
    accounts: [account({ pensionPaise: 999 }), { ...account({ kind: "nps", account: "N", ownPaise: null, employerPaise: null, pensionPaise: null, valuePaise: 4000, investedPaise: 3000, xirr: "5.2" }) }],
    holdings,
  });
  assert.equal(s.mf?.valuePaise, 2100000);
  assert.equal(s.nps?.valuePaise, 4000);
  assert.equal(s.nps?.contributedPaise, 3000);
  assert.equal(s.pf[0].balancePaise, 3000);
  assert.equal(s.pf[0].estimatedPaise, 35);
  assert.equal(s.totalValuePaise, 2100000 + 4000 + 3000);
});

test("how amounts and units are written", () => {
  assert.equal(wholeRupees(10524400), "₹1,05,244");
  assert.equal(formatUnits(40687055, 4), "4,068.7055");
  assert.equal(formatUnits(38226150), "3,822.615");
  assert.equal(formatNav(937131), "93.7131");
});

test("an import is described in a line, then its notes", () => {
  assert.deepEqual(describeImport({ what: "PF passbook 2026-27", added: 2, updated: 1, same: 4, kept: 0, removed: 1, notes: ["Note."] }), [
    "PF passbook 2026-27: 2 months added, 1 changed, 1 removed, 4 already there.",
    "Note.",
  ]);
  assert.match(describeImport({ what: "X", added: 0, updated: 0, same: 0, kept: 0, removed: 0, notes: [] })[0], /no monthly figures/);
});

test("gain is the value above what was invested, with a percentage; nothing invested known means no gain", () => {
  assert.deepEqual(gainOf(35822910, 31200000), { paise: 4622910, percent: (4622910 / 31200000) * 100 });
  assert.equal(gainOf(100, null), null);
  assert.equal(gainOf(100, 0)?.percent, null);
  assert.equal(gainText(gainOf(35822910, 31200000)!), "+₹46,229 (14.8%)");
  assert.equal(gainText(gainOf(14151044, 14400000)!), "-₹2,490 (-1.7%)");
  assert.equal(gainText({ paise: 500, percent: null }), "+₹5");
});

test("an NPS scheme is shown without the statement's POP marker", () => {
  assert.equal(schemeLabel("ICICI PENSION FUND SCHEME E - TIER I POP"), "ICICI PENSION FUND SCHEME E - TIER I");
  assert.equal(schemeLabel("SOME SCHEME"), "SOME SCHEME");
});

test("a fund's name is split into a clean title and plan and option tags", () => {
  const cases: [string, string, string[]][] = [
    ["Axis ELSS- Tax Saver Fund - Regular Growth", "Axis ELSS- Tax Saver Fund", ["Regular", "Growth"]],
    ["HDFC Balanced Advantage Fund - Regular Plan - Growth", "HDFC Balanced Advantage Fund", ["Regular", "Growth"]],
    ["ICICI Prudential Nifty Next 50 Index Fund - Growth", "ICICI Prudential Nifty Next 50 Index Fund", ["Growth"]],
    ["Kotak ELSS Tax Saver Fund - Growth (Regular Plan)", "Kotak ELSS Tax Saver Fund", ["Regular", "Growth"]],
    ["Mirae Asset ELSS Tax Saver Fund (formerly Mirae Asset Tax Saver Fund ) - Regular Plan", "Mirae Asset ELSS Tax Saver Fund", ["Regular"]],
    ["NIPPON INDIA GOLD SAVINGS FUND - IDCW PLAN", "NIPPON INDIA GOLD SAVINGS FUND", ["IDCW"]],
    ["SBI Nifty Index Fund - Regular Plan - Growth", "SBI Nifty Index Fund", ["Regular", "Growth"]],
    ["Parag Parikh Flexi Cap Fund - Direct Plan - Growth Option", "Parag Parikh Flexi Cap Fund", ["Direct", "Growth"]],
  ];
  for (const [name, title, tags] of cases) assert.deepEqual(fundDisplay(name), { title, tags }, name);
});

test("an NPS scheme becomes 'Scheme E · Equity' with its fund house and tier as tags", () => {
  assert.deepEqual(npsSchemeDisplay("ICICI PENSION FUND SCHEME E - TIER I POP"), { title: "Scheme E · Equity", tags: ["ICICI Pension Fund", "Tier I"] });
  assert.equal(npsSchemeDisplay("ICICI PENSION FUND SCHEME C - TIER I POP").title, "Scheme C · Corporate bonds");
  assert.equal(npsSchemeDisplay("SBI PENSION FUND SCHEME G - TIER II").title, "Scheme G · Government securities");
  assert.deepEqual(npsSchemeDisplay("Something odd"), { title: "Something odd", tags: [] });
});

test("purchases told about since the statement add units and money, valued at the statement's NAV or at the newer one", () => {
  const h = holding({ pendingUnitsE4: 100000, pendingInvestedPaise: 500000 }); // 200 units at NAV 50 = Rs 10,000, plus 10 units bought for Rs 5,000
  assert.equal(holdingUnits(h), 2100000);
  assert.equal(holdingInvested(h), 1300000);
  assert.deepEqual(holdingValue(h), { valuePaise: 1050000, navE4: 500000, navDate: "2026-10-31", live: false }, "10,000 + 10 x 50");
  assert.equal(holdingValue({ ...h, liveNavE4: 600000, liveNavDate: "2026-11-12" }).valuePaise, 1260000, "210 units x 60");
  assert.equal(holdingInvested(holding({ investedPaise: null, pendingInvestedPaise: 5 })), null);
  assert.equal(holdingTotals([h]).investedPaise, 1300000);
});
