import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  applyLiveNavs,
  applyMfCas,
  applyNpsStatement,
  applyPfPassbook,
  applySipPurchases,
  fillEstimates,
  loadOverview,
  setPfAutoAdd,
  type SqlDb,
} from "../../src/db/savingsSql";
import { SAVINGS_SQL } from "../../src/db/schemaSql";
import type { SipPurchase } from "../../src/domain/fundMail";
import type { MfCas } from "../../src/domain/mfCas";
import type { NpsStatement } from "../../src/domain/npsStatement";
import type { PfPassbook } from "../../src/domain/pfPassbook";

// Node's SQLite behind the same small adapter the phone's database uses.
const adapter = (db: DatabaseSync): SqlDb => ({
  all: async <T>(sql: string, params: (string | number | null)[] = []) => db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[],
  first: async <T>(sql: string, params: (string | number | null)[] = []) => {
    const row = db.prepare(sql).get(...params);
    return (row ? { ...row } : null) as T | null;
  },
  run: async (sql, params = []) => {
    db.prepare(sql).run(...params);
  },
});

function fresh(): { db: SqlDb; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(SAVINGS_SQL);
  return { db: adapter(raw), raw };
}

const MEMBER = "ABCDE12345670000012345";
const OLD_MEMBER = "FGHIJ98765430000054321";
const share = (own: number, employer = own, pension = 0) => ({ ownPaise: own, employerPaise: employer, pensionPaise: pension });

// A passbook with one contribution of 6,000 + 6,000 for each month given ("2026-03" is credited on 2026-04-01).
function passbook(months: string[], over: Partial<PfPassbook> = {}): PfPassbook {
  return {
    memberId: MEMBER,
    establishmentId: "ABCDE1234567000",
    fyStart: 2026,
    printedOn: "2026-11-13",
    opening: share(1000000),
    closing: share(2200000),
    contributions: months.map((month) => ({ month, creditedDate: `${month}-15`, ...share(600000) })),
    ...over,
  };
}

const months = (raw: DatabaseSync, kind = "pf", account = MEMBER) =>
  raw.prepare("SELECT month, own_paise AS own, source FROM savings_months WHERE kind = ? AND account = ? ORDER BY month").all(kind, account).map((r) => ({ ...r }));

test("a passbook adds its months once; importing it again changes nothing", async () => {
  const { db, raw } = fresh();
  const first = await applyPfPassbook(db, passbook(["2026-08", "2026-09"]));
  assert.equal(first.added, 2);
  const again = await applyPfPassbook(db, passbook(["2026-08", "2026-09"]));
  assert.deepEqual([again.added, again.updated, again.same], [0, 0, 2]);
  assert.equal(months(raw).length, 2);
  assert.equal((await loadOverview(db)).accounts.length, 1);
});

test("a new account is active when its passbook is recent and keeps the usual amounts from it; an old one is closed", async () => {
  const { db } = fresh();
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"]));
  await applyPfPassbook(db, passbook(["2025-03"], { memberId: OLD_MEMBER, fyStart: 2025 }));
  const accounts = (await loadOverview(db)).accounts;
  const current = accounts.find((a) => a.account === MEMBER);
  const old = accounts.find((a) => a.account === OLD_MEMBER);
  assert.equal(current?.status, "ACTIVE");
  assert.equal(current?.autoAdd, false, "the switch starts off");
  assert.equal(current?.estOwnPaise, 600000);
  assert.equal(old?.status, "CLOSED");
  assert.equal(old?.estOwnPaise, 0);
  assert.deepEqual([current?.ownPaise, current?.employerPaise], [2200000, 2200000]);
});

test("with the switch on, the month's estimate is added at once and the months since; a closed account gets none", async () => {
  const { db, raw } = fresh();
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"]));
  await applyPfPassbook(db, passbook(["2025-03"], { memberId: OLD_MEMBER, fyStart: 2025 }));
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 10, 13));
  assert.deepEqual(months(raw), [
    { month: "2026-08", own: 600000, source: "statement" },
    { month: "2026-09", own: 600000, source: "statement" },
    { month: "2026-11", own: 600000, source: "estimate" },
  ]);
  assert.equal((await fillEstimates(db, new Date(2026, 10, 20))), 0, "nothing more is due in the same month");
  assert.equal((await fillEstimates(db, new Date(2026, 11, 2))), 1, "December's is added when December comes");
  assert.equal(months(raw, "pf", OLD_MEMBER).length, 1);
});

test("a month the switch was off for is never filled in later", async () => {
  const { db, raw } = fresh();
  await applyPfPassbook(db, passbook(["2026-08"], { printedOn: "2026-09-20" }));
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 8, 5)); // September
  await setPfAutoAdd(db, MEMBER, false, new Date(2026, 8, 20));
  await fillEstimates(db, new Date(2026, 9, 10)); // October: off
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 10, 3)); // November
  assert.deepEqual(
    months(raw).map((m) => m.month),
    ["2026-08", "2026-09", "2026-11"],
    "September was on, October was off, November is on again",
  );
});

test("a passbook replaces an estimate with the real figure and removes an estimate it passed without listing", async () => {
  const { db, raw } = fresh();
  await applyPfPassbook(db, passbook(["2026-08"], { printedOn: "2026-09-20" }));
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 8, 5));
  await fillEstimates(db, new Date(2026, 10, 13)); // estimates for Sep, Oct, Nov
  assert.deepEqual(months(raw).map((m) => `${m.month}:${m.source}`), ["2026-08:statement", "2026-09:estimate", "2026-10:estimate", "2026-11:estimate"]);

  // The new passbook lists September (a different amount) and November's wage month, but not October (not paid).
  const next = passbook(["2026-08", "2026-09", "2026-11"], { contributions: [
    { month: "2026-08", creditedDate: "2026-09-15", ...share(600000) },
    { month: "2026-09", creditedDate: "2026-10-15", ...share(650000) },
    { month: "2026-11", creditedDate: "2026-12-01", ...share(650000) },
  ] });
  const report = await applyPfPassbook(db, next);
  // August is the same, September and November change from estimates to the passbook's figures, October (an estimate the passbook passed) is removed.
  assert.deepEqual([report.added, report.updated, report.same, report.removed], [0, 2, 1, 1]);
  assert.deepEqual(months(raw), [
    { month: "2026-08", own: 600000, source: "statement" },
    { month: "2026-09", own: 650000, source: "statement" },
    { month: "2026-11", own: 650000, source: "statement" },
  ]);
});

test("estimates the passbook has not reached stay", async () => {
  const { db, raw } = fresh();
  await applyPfPassbook(db, passbook(["2026-08"], { printedOn: "2026-09-20" }));
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 8, 5));
  await fillEstimates(db, new Date(2026, 10, 13));
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"]));
  assert.deepEqual(months(raw).map((m) => `${m.month}:${m.source}`), ["2026-08:statement", "2026-09:statement", "2026-10:estimate", "2026-11:estimate"]);
});

test("an older passbook adds its months but keeps the newer balances", async () => {
  const { db } = fresh();
  await applyPfPassbook(db, passbook(["2026-08"]));
  const report = await applyPfPassbook(db, passbook(["2025-03"], { fyStart: 2025, closing: share(500000) }));
  assert.equal(report.added, 1);
  assert.match(report.notes.join(" "), /older/);
  const account = (await loadOverview(db)).accounts[0];
  assert.equal(account.fy, 2026);
  assert.equal(account.ownPaise, 2200000);
});

test("every passbook sets whether the account is active and what a month usually is; nothing is typed", async () => {
  const { db, raw } = fresh();
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"], { printedOn: "2026-10-05" }));
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 9, 6)); // October: the estimate for October uses 6,000 + 6,000
  assert.equal((await loadOverview(db)).accounts[0].estOwnPaise, 600000);
  assert.equal(raw.prepare("SELECT own_paise AS o FROM savings_months WHERE source = 'estimate'").get()?.o, 600000);

  // A newer passbook with a raise: the usual amounts follow it, and so does the estimate it has not reached.
  await applyPfPassbook(db, passbook(["2026-08", "2026-09", "2026-10"], {
    printedOn: "2026-11-20",
    contributions: ["2026-08", "2026-09"].map((month) => ({ month, creditedDate: `${month}-15`, ...share(600000) })).concat([{ month: "2026-10", creditedDate: "2026-11-15", ...share(700000) }]),
  }));
  await fillEstimates(db, new Date(2026, 10, 21)); // November
  const account = (await loadOverview(db)).accounts[0];
  assert.deepEqual([account.status, account.autoAdd, account.estOwnPaise, account.estEmployerPaise], ["ACTIVE", true, 700000, 700000]);
  assert.deepEqual(months(raw).map((m) => `${m.month}:${m.source}:${m.own}`), ["2026-08:statement:600000", "2026-09:statement:600000", "2026-10:statement:700000", "2026-11:estimate:700000"]);
});

test("a passbook that shows no recent contribution makes the account closed and switches its estimates off", async () => {
  const { db, raw } = fresh();
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"], { printedOn: "2026-10-05" }));
  await setPfAutoAdd(db, MEMBER, true, new Date(2026, 9, 6));
  // Printed in March: the newest contribution is from September, six months before.
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"], { printedOn: "2027-03-10" }));
  const account = (await loadOverview(db)).accounts[0];
  assert.deepEqual([account.status, account.autoAdd, account.autoFrom, account.estOwnPaise], ["CLOSED", false, null, 0]);
  assert.equal((await fillEstimates(db, new Date(2027, 2, 12))), 0, "a closed account gets no estimates");
  assert.ok(raw.prepare("SELECT COUNT(*) AS n FROM savings_months").get());
});

test("a passbook with no contribution at all (a new year with nothing credited yet) leaves the status and usual amounts as they were", async () => {
  const { db } = fresh();
  await applyPfPassbook(db, passbook(["2026-08", "2026-09"], { printedOn: "2026-10-05" }));
  await applyPfPassbook(db, passbook([], { fyStart: 2027, printedOn: "2027-04-02", opening: share(2200000), closing: share(2200000) }));
  const account = (await loadOverview(db)).accounts[0];
  assert.deepEqual([account.status, account.estOwnPaise, account.fy], ["ACTIVE", 600000, 2027]);
});

// ---- NPS ----------------------------------------------------------------------------------------------------------------------------------------

const nps = (over: Partial<NpsStatement> = {}): NpsStatement => ({
  pran: "123456789012",
  periodStart: "2026-04-01",
  periodEnd: "2026-11-13",
  navDate: "2026-11-12",
  valuePaise: 10000000,
  contributedPaise: 9000000,
  xirr: "6.50",
  holdings: [{ name: "TEST SCHEME E - TIER I POP", unitsE4: 10000000, navE4: 700000, valuePaise: 7000000 }, { name: "TEST SCHEME G - TIER I POP", unitsE4: 10000000, navE4: 300000, valuePaise: 3000000 }],
  contributions: [
    { month: "2026-09", creditedDate: "2026-10-05", ownPaise: 0, employerPaise: 1000000 },
    { month: "2026-10", creditedDate: "2026-11-02", ownPaise: 0, employerPaise: 1000000 },
  ],
  ...over,
});

test("an NPS statement stores the account, the units and each month; importing it again changes nothing", async () => {
  const { db, raw } = fresh();
  const first = await applyNpsStatement(db, nps());
  assert.equal(first.added, 2);
  const again = await applyNpsStatement(db, nps());
  assert.deepEqual([again.added, again.updated, again.same], [0, 0, 2]);
  const overview = await loadOverview(db);
  assert.equal(overview.accounts.length, 1);
  assert.equal(overview.holdings.length, 2);
  assert.equal(months(raw, "nps", "123456789012").length, 2);
});

test("an overlapping NPS statement adds only the new months; a narrower one cannot shrink a month it only partly saw", async () => {
  const { db, raw } = fresh();
  await applyNpsStatement(db, nps());
  // This statement starts on 10 November, after October's credit of 2 November: it cannot have all of October (here it shows only a later credit).
  const report = await applyNpsStatement(db, nps({
    periodStart: "2026-11-10",
    contributions: [
      { month: "2026-10", creditedDate: "2026-11-12", ownPaise: 0, employerPaise: 400000 },
      { month: "2026-11", creditedDate: "2026-12-02", ownPaise: 0, employerPaise: 1000000 },
    ],
  }));
  assert.deepEqual([report.added, report.same, report.kept], [1, 0, 1]);
  assert.deepEqual(months(raw, "nps", "123456789012").map((m) => [m.month, m.own]), [["2026-09", 0], ["2026-10", 0], ["2026-11", 0]]);
  const october = raw.prepare("SELECT employer_paise AS e FROM savings_months WHERE kind = 'nps' AND month = '2026-10'").get() as { e: number };
  assert.equal(october.e, 1000000, "October kept its full figure");
});

test("an older NPS statement keeps the newer value and units but still adds its months", async () => {
  const { db } = fresh();
  await applyNpsStatement(db, nps());
  const report = await applyNpsStatement(db, nps({ periodEnd: "2026-06-30", valuePaise: 5, contributions: [{ month: "2026-05", creditedDate: "2026-06-24", ownPaise: 0, employerPaise: 1000000 }] }));
  assert.equal(report.added, 1);
  const overview = await loadOverview(db);
  assert.equal(overview.accounts[0].valuePaise, 10000000);
  assert.equal(overview.holdings.length, 2);
});

// ---- mutual funds -------------------------------------------------------------------------------------------------------------------------------

const cas = (over: Partial<MfCas> = {}): MfCas => ({
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  valuationDate: "2026-10-31",
  holdings: [
    { isin: "INF000A01001", folio: "111/1", name: "Alpha", unitsE4: 2000000, navE4: 500000, investedPaise: 800000, valuePaise: 1000000 },
    { isin: "INF000B01002", folio: "222", name: "Beta", unitsE4: 100000, navE4: 1000000, investedPaise: 100000, valuePaise: 100000 },
  ],
  purchases: [
    { date: "2026-10-05", isin: "INF000A01001", amountPaise: 500000 },
    { date: "2026-10-12", isin: "INF000B01002", amountPaise: 300000 },
  ],
  ...over,
});

test("a CAS stores the holdings and one total for each month it covers; importing it again changes nothing", async () => {
  const { db, raw } = fresh();
  const first = await applyMfCas(db, cas());
  assert.equal(first.added, 1);
  assert.deepEqual(months(raw, "mf", ""), [{ month: "2026-10", own: 800000, source: "statement" }]);
  const again = await applyMfCas(db, cas());
  assert.deepEqual([again.added, again.updated, again.same], [0, 0, 1]);
  assert.equal((await loadOverview(db)).holdings.length, 2);
  assert.equal(months(raw, "mf", "").length, 1);
});

test("a later CAS replaces the list of funds (a fund no longer held is gone); an older one keeps it", async () => {
  const { db } = fresh();
  await applyMfCas(db, cas());
  await applyMfCas(db, cas({ periodStart: "2026-11-01", periodEnd: "2026-11-30", valuationDate: "2026-11-30", holdings: [cas().holdings[0]], purchases: [] }));
  assert.deepEqual((await loadOverview(db)).holdings.map((h) => h.code), ["INF000A01001"]);
  const old = await applyMfCas(db, cas({ periodStart: "2026-09-01", periodEnd: "2026-09-30", valuationDate: "2026-09-30", purchases: [{ date: "2026-09-03", isin: "INF000A01001", amountPaise: 100 }] }));
  assert.match(old.notes.join(" "), /older/);
  assert.equal((await loadOverview(db)).holdings.length, 1);
  assert.deepEqual((await loadOverview(db)).months.map((m) => m.month).sort(), ["2026-09", "2026-10"], "September's total was still added; November had no purchase");
});

test("a month a CAS covers only in part is not counted, and says so", async () => {
  const { db, raw } = fresh();
  const report = await applyMfCas(db, cas({ periodStart: "2026-10-05", periodEnd: "2026-10-20" }));
  assert.equal(months(raw, "mf", "").length, 0);
  assert.match(report.notes.join(" "), /2026-10/);
});

test("a covered month with no purchase removes a figure an earlier statement had for it", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  const report = await applyMfCas(db, cas({ purchases: [] }));
  assert.equal(report.removed, 1);
  assert.equal(months(raw, "mf", "").length, 0);
});

// ---- the live NAV -------------------------------------------------------------------------------------------------------------------------------

test("a NAV found online is kept per holding and only replaced by a newer one", async () => {
  const { db } = fresh();
  await applyMfCas(db, cas());
  const nav = (navE4: number, date: string) => ({ kind: "mf" as const, account: "111/1", code: "INF000A01001", navE4, date });
  await applyLiveNavs(db, [nav(520000, "2026-11-12")]);
  await applyLiveNavs(db, [nav(510000, "2026-11-10")]);
  const alpha = (await loadOverview(db)).holdings.find((h) => h.code === "INF000A01001");
  assert.deepEqual([alpha?.liveNavE4, alpha?.liveNavDate], [520000, "2026-11-12"]);
});

test("every CHECK on the savings tables is named, so a later change to its values is an ALTER", () => {
  const checks = SAVINGS_SQL.match(/CHECK\b/g) ?? [];
  const named = SAVINGS_SQL.match(/CONSTRAINT \w+ CHECK\b/g) ?? [];
  assert.equal(named.length, checks.length);
  assert.ok(checks.length >= 6);
});

// ---- purchases told about by a fund house's email ------------------------------------------------------------------------------------------------

const sip = (over: Partial<SipPurchase> = {}): SipPurchase => ({ isin: "INF000A01001", folio: "111", name: null, date: "2026-11-05", unitsE4: 606510, netPaise: 599970, stampPaise: 30, navE4: 989220, ...over });
const beta = (over: Partial<SipPurchase> = {}): SipPurchase => sip({ isin: null, folio: "222", date: "2026-11-06", unitsE4: 100000, netPaise: 499975, stampPaise: 25, navE4: 500000, ...over });
const count = (raw: DatabaseSync) => (raw.prepare("SELECT COUNT(*) AS n FROM savings_purchases").get() as { n: number }).n;
const mfMonth = (raw: DatabaseSync, month: string) => {
  const row = raw.prepare("SELECT own_paise AS paid, source FROM savings_months WHERE kind = 'mf' AND month = ?").get(month) as { paid: number; source: string } | undefined;
  return row ? { ...row } : undefined; // Node's SQLite hands back rows with no prototype
};
const novemberMf = (raw: DatabaseSync) => mfMonth(raw, "2026-11");

test("a purchase from an email is stored once, adds to the fund's units and to the month's total", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  const report = await applySipPurchases(db, [sip(), beta()], "Purchase email");
  assert.deepEqual([report.added, report.same, report.kept, report.unit], [2, 0, 0, "purchase"]);
  assert.deepEqual(novemberMf(raw), { paid: 1100000, source: "estimate" }, "6,000 + 5,000, until the CAS says what the month was");
  const holdings = (await loadOverview(db)).holdings;
  const alpha = holdings.find((h) => h.code === "INF000A01001");
  assert.deepEqual([alpha?.pendingUnitsE4, alpha?.pendingInvestedPaise, alpha?.unitsE4], [606510, 600000, 2000000]);
  assert.equal(holdings.find((h) => h.code === "INF000B01002")?.pendingUnitsE4, 100000);
});

test("the same email twice, or a statement that lists earlier purchases again, adds nothing", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  await applySipPurchases(db, [sip()], "Purchase email");
  const again = await applySipPurchases(db, [sip()], "Purchase email");
  assert.deepEqual([again.added, again.same], [0, 1]);
  // A statement that also lists the October purchase, which the CAS already has, and the same November one.
  const overlap = await applySipPurchases(db, [sip({ date: "2026-10-05", unitsE4: 648910 }), sip()], "Fund statement");
  assert.deepEqual([overlap.added, overlap.same, overlap.kept], [0, 1, 1]);
  assert.equal(count(raw), 1);
  assert.equal(novemberMf(raw)?.paid, 600000);
});

test("units that differ only in the last digit are the same purchase", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  await applySipPurchases(db, [sip()], "Purchase email");
  const report = await applySipPurchases(db, [sip({ unitsE4: 606500 })], "Fund statement");
  assert.deepEqual([report.added, report.same], [0, 1]);
  assert.equal(count(raw), 1);
});

test("two identical purchases on one day stay two, and a document that lists one of them adds nothing", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  const both = await applySipPurchases(db, [sip(), sip()], "Fund statement");
  assert.deepEqual([both.added, both.same], [2, 0]);
  const one = await applySipPurchases(db, [sip()], "Purchase email");
  assert.deepEqual([one.added, one.same], [0, 1]);
  assert.equal(count(raw), 2);
  assert.equal(novemberMf(raw)?.paid, 1200000);
});

test("a purchase for a fund that is not in the CAS is left out and named; with no CAS at all nothing is stored", async () => {
  const none = fresh();
  const first = await applySipPurchases(none.db, [sip()], "Purchase email");
  assert.match(first.notes.join(" "), /Import your mutual fund statement/);
  assert.equal(count(none.raw), 0);

  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  const report = await applySipPurchases(db, [sip({ isin: "INF999Z99999", folio: null, name: "Some Other Fund" })], "Purchase email");
  assert.equal(report.added, 0);
  assert.match(report.notes.join(" "), /Some Other Fund/);
  assert.equal(count(raw), 0);
});

test("the next CAS replaces the purchases for the months it covers: the month takes the CAS's figure and the units are the CAS's", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  await applySipPurchases(db, [sip(), beta()], "Purchase email");
  assert.equal(novemberMf(raw)?.source, "estimate");

  const november = await applyMfCas(db, cas({
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    valuationDate: "2026-11-30",
    holdings: [
      { isin: "INF000A01001", folio: "111/1", name: "Alpha", unitsE4: 2606510, navE4: 500000, investedPaise: 1400000, valuePaise: 1303255 },
      { isin: "INF000B01002", folio: "222", name: "Beta", unitsE4: 200000, navE4: 1000000, investedPaise: 600000, valuePaise: 200000 },
    ],
    purchases: [
      { date: "2026-11-05", isin: "INF000A01001", amountPaise: 600000 },
      { date: "2026-11-06", isin: "INF000B01002", amountPaise: 500000 },
      { date: "2026-11-20", isin: "INF000B01002", amountPaise: 100000 },
    ],
  }));
  assert.deepEqual([november.added, november.updated], [0, 1], "the provisional month is replaced, not added to");
  assert.deepEqual(novemberMf(raw), { paid: 1200000, source: "statement" });
  assert.equal(count(raw), 0, "the purchases the CAS covers are dropped");
  const alpha = (await loadOverview(db)).holdings.find((h) => h.code === "INF000A01001");
  assert.deepEqual([alpha?.unitsE4, alpha?.pendingUnitsE4], [2606510, 0], "no purchase is counted twice");
});

test("a purchase after the CAS keeps being added until the next CAS, and a month with a CAS figure is never changed by an email", async () => {
  const { db, raw } = fresh();
  await applyMfCas(db, cas());
  await applySipPurchases(db, [sip({ date: "2026-12-05", unitsE4: 500000 })], "Purchase email");
  assert.equal((await loadOverview(db)).holdings.find((h) => h.code === "INF000A01001")?.pendingUnitsE4, 500000);
  assert.deepEqual(mfMonth(raw, "2026-10"), { paid: 800000, source: "statement" });
});
