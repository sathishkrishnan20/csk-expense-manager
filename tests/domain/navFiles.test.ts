import { test } from "node:test";
import assert from "node:assert/strict";
import { matchNpsScheme, navUpdatesFor, normaliseSchemeName, parseAmfiNavs, parseNpsNavs } from "../../src/domain/navFiles";
import type { SavingsHolding } from "../../src/domain/savings";

const AMFI = [
  "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date",
  "Open Ended Schemes(Equity Scheme - Test Cap Fund)",
  "100001;INF000A01001;-;Alpha Equity Fund - Regular Growth;55.5000;12-Nov-2026",
  "100002;INF000B01002;INF000B01010;Beta Fund - IDCW;N.A.;12-Nov-2026",
  "100003;INF000C01003;-;Gamma Fund;12.3456;11-Nov-2026",
  "100004;INF000C01003;-;Gamma Fund (second listing);12.4000;12-Nov-2026",
].join("\n");

// Public NAV rows (the real ICICI ones for 12 Nov 2026) and a second scheme with the same words, to check that an ambiguous name is not guessed.
const NPS = [
  "ID\tDATE OF NAV\tPFM NAME\tSCHEME ID\tSCHEME NAME\tNAV VALUE",
  "126\t2026-11-12\tICICI Pension Fund Management Limited\tSM007001\tICICI PRUDENTIAL PENSION FUND SCHEME E - TIER I\t76.8979",
  "127\t2026-11-12\tICICI Pension Fund Management Limited\tSM007002\tICICI PRUDENTIAL PENSION FUND  SCHEME C - TIER I\t46.5626",
  "300\t2026-11-12\tTest Pension\tSM099001\tTEST PENSION SCHEME E - TIER I\t10.0000",
  "301\t2026-11-12\tTest Pension\tSM099002\tTEST PENSION SCHEME E - TIER I\t11.0000",
].join("\n");

test("AMFI: each wanted ISIN gets its NAV and date; N.A. and unwanted lines are skipped; the newest date wins for an ISIN listed twice", () => {
  const found = parseAmfiNavs(AMFI, new Set(["INF000A01001", "INF000B01002", "INF000B01010", "INF000C01003"]));
  assert.deepEqual(found.get("INF000A01001"), { navE4: 555000, date: "2026-11-12" });
  assert.equal(found.has("INF000B01002"), false);
  assert.deepEqual(found.get("INF000C01003"), { navE4: 124000, date: "2026-11-12" });
  assert.equal(parseAmfiNavs(AMFI, new Set()).size, 0);
});

test("AMFI: the extra Plan and Option columns some copies of the file have do not matter", () => {
  const wide = "135759;INF846K01WJ1;-;Axis Children's Fund;Regular Plan;Growth Option;27.1290;12-Nov-2026";
  assert.deepEqual(parseAmfiNavs(wide, new Set(["INF846K01WJ1"])).get("INF846K01WJ1"), { navE4: 271290, date: "2026-11-12" });
});

test("NPS: rows are read, and a statement's scheme name finds its one row", () => {
  const rows = parseNpsNavs(NPS);
  assert.equal(rows.length, 4);
  assert.equal(matchNpsScheme("ICICI PENSION FUND SCHEME E - TIER I POP", rows)?.schemeId, "SM007001");
  assert.equal(matchNpsScheme("ICICI PENSION FUND SCHEME C - TIER I POP", rows)?.navE4, 465626);
  assert.equal(matchNpsScheme("ICICI PENSION FUND SCHEME G - TIER I POP", rows), null, "no such row");
  assert.equal(matchNpsScheme("TEST PENSION SCHEME E - TIER I", rows), null, "two rows: not guessed");
  assert.equal(normaliseSchemeName("ICICI PRUDENTIAL PENSION FUND  SCHEME E - TIER I"), normaliseSchemeName("ICICI PENSION FUND SCHEME E - TIER I POP"));
});

const holding = (over: Partial<SavingsHolding>): SavingsHolding => ({
  kind: "mf", account: "F", code: "INF000A01001", name: "Alpha", unitsE4: 1, navE4: 1, valuePaise: 1, investedPaise: null, asOf: "2026-10-31", navDate: "2026-10-31", liveNavE4: null, liveNavDate: null, ...over,
});

test("newer NAVs for the holdings: funds by ISIN, schemes by name; a missing, ambiguous or not-newer NAV is left out", () => {
  const updates = navUpdatesFor(
    [
      holding({}),
      holding({ code: "INF000Z09999", account: "F2" }),
      holding({ kind: "nps", account: "P", code: "ICICI PENSION FUND SCHEME E - TIER I POP", name: "ICICI PENSION FUND SCHEME E - TIER I POP", navDate: "2026-11-12" }),
      holding({ kind: "nps", account: "P", code: "ICICI PENSION FUND SCHEME C - TIER I POP", name: "ICICI PENSION FUND SCHEME C - TIER I POP", navDate: "2026-11-01" }),
    ],
    AMFI,
    NPS,
  );
  assert.deepEqual(updates, [
    { kind: "mf", account: "F", code: "INF000A01001", navE4: 555000, date: "2026-11-12" },
    { kind: "nps", account: "P", code: "ICICI PENSION FUND SCHEME E - TIER I POP", navE4: 768979, date: "2026-11-12" },
    { kind: "nps", account: "P", code: "ICICI PENSION FUND SCHEME C - TIER I POP", navE4: 465626, date: "2026-11-12" },
  ]);
  assert.deepEqual(navUpdatesFor([holding({})], null, null), []);
});
