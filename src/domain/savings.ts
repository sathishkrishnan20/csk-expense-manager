import { formatRupeeAmount } from "./format";

// Savings: what the owner has put into mutual funds, NPS and PF, kept for information only (nothing here is a transaction or part of any balance, group or
// chart). The numbers come from statements the owner imports (a CAS, the Protean NPS statement, the EPF passbook); see mfCas.ts, npsStatement.ts and
// pfPassbook.ts. This file holds the rules every source shares: one total per kind per month, which of two figures for the same month wins, the monthly PF
// estimate, and the value of the holdings. Pure.

export type SavingsKind = "mf" | "nps" | "pf";

export const KIND_LABELS: Record<SavingsKind, string> = { mf: "Mutual funds", nps: "NPS", pf: "PF" };

// What was put in for one month, by one account. `ownPaise` is the owner's own money (the employee share of PF, a SIP, a purchase), `employerPaise` what
// the employer put in, `pensionPaise` the EPS share of PF. A mutual fund month has no account (a total across every fund and folio).
export interface MonthRow {
  kind: SavingsKind;
  account: string; // "" for mutual funds, the PRAN for NPS, the member ID for PF
  month: string; // "2026-10"
  ownPaise: number;
  employerPaise: number;
  pensionPaise: number;
  source: "statement" | "estimate";
  creditedDate: string | null; // the earliest day it was credited, when the statement says
}

export const monthTotalPaise = (r: Pick<MonthRow, "ownPaise" | "employerPaise" | "pensionPaise">): number => r.ownPaise + r.employerPaise + r.pensionPaise;

export interface SavingsAccount {
  kind: "pf" | "nps";
  account: string; // the member ID or the PRAN
  label: string | null; // the establishment of a PF account
  status: "ACTIVE" | "CLOSED";
  asOf: string | null; // the day the balances are as of
  fy: number | null; // PF: the financial year of the passbook the balances came from (2026 for 2026-27)
  valuePaise: number | null; // NPS: the value the statement printed
  investedPaise: number | null; // NPS: everything put in since the account began
  xirr: string | null; // NPS: the statement's own return figure
  ownPaise: number | null; // PF balances, as of asOf
  employerPaise: number | null;
  pensionPaise: number | null;
  autoAdd: boolean; // PF: add each month's usual contribution as an estimate until the passbook shows it
  autoFrom: string | null; // the month the switch was last turned on
  estOwnPaise: number; // the usual monthly amounts
  estEmployerPaise: number;
  estPensionPaise: number;
}

// The units of one mutual fund (by ISIN) or NPS scheme as the last statement printed them, and the latest NAV looked up since. Units are x 10,000.
export interface SavingsHolding {
  kind: "mf" | "nps";
  account: string; // the folio, or the PRAN
  code: string; // the ISIN, or the scheme's name as the statement prints it
  name: string;
  unitsE4: number;
  navE4: number; // the statement's NAV
  valuePaise: number; // the statement's value
  investedPaise: number | null;
  asOf: string; // the statement's date
  navDate: string | null; // the day the statement's NAV is for
  liveNavE4: number | null; // a newer NAV found online
  liveNavDate: string | null;
  // Purchases made since the statement's date that a fund house's confirmation email told about (a SIP instalment): the units and the money, added until the next CAS
  // makes them part of the statement. Absent (or 0) when there are none.
  pendingUnitsE4?: number;
  pendingInvestedPaise?: number;
}

export interface SavingsOverview {
  months: MonthRow[];
  accounts: SavingsAccount[];
  holdings: SavingsHolding[];
}

// ---- months ---------------------------------------------------------------------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

// "2026-11" for a date in the phone's own time zone.
export const monthOfDate = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
export const monthOfIso = (iso: string): string => iso.slice(0, 7);

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
}

// Every month from `from` to `to`, both included; empty when `from` is after `to`.
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 1200; m = nextMonth(m)) out.push(m);
  return out;
}

// The months a statement for [start, end] covers from its first day to its last. A month the statement only partly covers (a statement run to the 13th)
// is not final, so it is left to a later statement.
export function monthsFullyCovered(start: string, end: string): string[] {
  const first = start.slice(8) === "01" ? monthOfIso(start) : nextMonth(monthOfIso(start));
  return monthsBetween(first, monthOfIso(end)).filter((m) => lastDayOfMonth(m) <= end);
}

// "Oct 2026"
export function monthLabel(month: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m] = month.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
}

// ---- which figure wins ------------------------------------------------------------------------------------------------------------------------------

export type MonthDecision = "add" | "update" | "same" | "keep";

const sameAmounts = (a: MonthRow, b: MonthRow): boolean => a.ownPaise === b.ownPaise && a.employerPaise === b.employerPaise && a.pensionPaise === b.pensionPaise;

// A statement's figure for a month against what is stored. A statement always replaces an estimate. Against an earlier statement figure it replaces it
// (a newer statement is a correction) unless the statement started after the earliest credit already known for that month: then it cannot have seen all
// of that month's credits, so the figure it has is partial and the stored one is kept. Importing the same figures again is "same".
export function decideMonth(existing: MonthRow | undefined, incoming: MonthRow, statementStart: string | null): MonthDecision {
  if (!existing) return "add";
  if (existing.source === "estimate") return "update";
  if (sameAmounts(existing, incoming)) return "same";
  if (statementStart !== null && existing.creditedDate !== null && statementStart > existing.creditedDate) return "keep";
  return "update";
}

// ---- the PF estimate ------------------------------------------------------------------------------------------------------------------------------

// The months to add an estimate for: from the month the switch was turned on to this month, for an active PF account whose switch is on, skipping the
// months that already have a figure (a passbook's or an earlier estimate). A month the switch was off for is never filled in later: turning it on again
// starts from that month (see toggledAutoAdd).
export function estimateMonths(account: Pick<SavingsAccount, "kind" | "status" | "autoAdd" | "autoFrom">, have: ReadonlySet<string>, now: Date): string[] {
  if (account.kind !== "pf" || account.status !== "ACTIVE" || !account.autoAdd || !account.autoFrom) return [];
  return monthsBetween(account.autoFrom, monthOfDate(now)).filter((m) => !have.has(m));
}

export function toggledAutoAdd(account: Pick<SavingsAccount, "autoAdd" | "autoFrom">, on: boolean, now: Date): { autoAdd: boolean; autoFrom: string | null } {
  if (!on) return { autoAdd: false, autoFrom: null };
  return { autoAdd: true, autoFrom: account.autoAdd && account.autoFrom ? account.autoFrom : monthOfDate(now) };
}

// The usual amounts, taken from the newest month a passbook shows.
export function usualAmounts(months: readonly Pick<MonthRow, "month" | "ownPaise" | "employerPaise" | "pensionPaise">[]): { own: number; employer: number; pension: number } {
  const last = [...months].sort((a, b) => b.month.localeCompare(a.month))[0];
  return last ? { own: last.ownPaise, employer: last.employerPaise, pension: last.pensionPaise } : { own: 0, employer: 0, pension: 0 };
}

const monthIndex = (month: string): number => {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + m;
};

// A PF account is "active" when its passbook shows a contribution from the last three months before the passbook was printed (the newest wage month is usually
// the month before the print month, as the employer pays it a few weeks later, and a late deposit can make it one more). It is read from every passbook, never typed.
export function looksActive(latestMonth: string | null, printedOn: string): boolean {
  return latestMonth !== null && monthIndex(monthOfIso(printedOn)) - monthIndex(latestMonth) <= 3;
}

// ---- the monthly list -----------------------------------------------------------------------------------------------------------------------------

export interface MonthLine {
  month: string;
  mfPaise: number;
  npsPaise: number;
  pfPaise: number;
  totalPaise: number;
  pfEstimated: boolean; // some of the PF figure is an estimate
}

// One line per month that has anything, newest first; a kind with nothing for a month is 0 (the page shows it as a dash).
export function monthLines(rows: readonly MonthRow[]): MonthLine[] {
  const byMonth = new Map<string, MonthLine>();
  for (const r of rows) {
    const line = byMonth.get(r.month) ?? { month: r.month, mfPaise: 0, npsPaise: 0, pfPaise: 0, totalPaise: 0, pfEstimated: false };
    const amount = monthTotalPaise(r);
    if (r.kind === "mf") line.mfPaise += amount;
    else if (r.kind === "nps") line.npsPaise += amount;
    else {
      line.pfPaise += amount;
      if (r.source === "estimate") line.pfEstimated = true;
    }
    line.totalPaise += amount;
    byMonth.set(r.month, line);
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

// ---- value ------------------------------------------------------------------------------------------------------------------------------------------

// Units x NAV in paise. Units and NAV are both x 10,000, so their product is x 10^8 and a rupee is 100 paise.
export const valuePaiseOf = (unitsE4: number, navE4: number): number => Math.round((unitsE4 * navE4) / 1e6);

// The units and the amount invested in a holding as they stand: the statement's, plus purchases told about since by email.
export const holdingUnits = (h: SavingsHolding): number => h.unitsE4 + (h.pendingUnitsE4 ?? 0);
export const holdingInvested = (h: SavingsHolding): number | null => (h.investedPaise === null ? null : h.investedPaise + (h.pendingInvestedPaise ?? 0));

// The value of a holding today: its units (the statement's plus any purchases told about since) at the newest NAV, when one newer than the statement's was found online;
// otherwise the statement's own value, plus the newer units at the statement's NAV.
export function holdingValue(h: SavingsHolding): { valuePaise: number; navE4: number; navDate: string | null; live: boolean } {
  const extra = h.pendingUnitsE4 ?? 0;
  const newer = h.liveNavE4 !== null && h.liveNavDate !== null && (h.navDate === null || h.liveNavDate > h.navDate);
  return newer
    ? { valuePaise: valuePaiseOf(h.unitsE4 + extra, h.liveNavE4 as number), navE4: h.liveNavE4 as number, navDate: h.liveNavDate, live: true }
    : { valuePaise: h.valuePaise + (extra > 0 ? valuePaiseOf(extra, h.navE4) : 0), navE4: h.navE4, navDate: h.navDate, live: false };
}

export interface FundTotals {
  valuePaise: number;
  investedPaise: number | null; // null when no holding says what was invested
  asOf: string | null; // the statement's date
  navDate: string | null; // the newest NAV day used
  live: boolean;
}

export function holdingTotals(holdings: readonly SavingsHolding[]): FundTotals {
  let value = 0;
  let invested: number | null = null;
  let asOf: string | null = null;
  let navDate: string | null = null;
  let live = false;
  for (const h of holdings) {
    const v = holdingValue(h);
    value += v.valuePaise;
    const put = holdingInvested(h);
    if (put !== null) invested = (invested ?? 0) + put;
    if (asOf === null || h.asOf > asOf) asOf = h.asOf;
    if (v.navDate && (navDate === null || v.navDate > navDate)) navDate = v.navDate;
    live = live || v.live;
  }
  return { valuePaise: value, investedPaise: invested, asOf, navDate, live };
}

export interface SavingsSummary {
  mf: FundTotals | null;
  nps: (FundTotals & { contributedPaise: number | null; xirr: string | null; account: string }) | null;
  pf: { account: SavingsAccount; balancePaise: number; estimatedPaise: number }[]; // balance: employee + employer (the pension share is kept apart)
  totalValuePaise: number;
}

// How much a PF account's estimated months add up to (employee + employer + pension), since its passbook.
export function pfEstimatedPaise(account: SavingsAccount, months: readonly MonthRow[]): number {
  return months.filter((m) => m.kind === "pf" && m.account === account.account && m.source === "estimate").reduce((sum, m) => sum + monthTotalPaise(m), 0);
}

export function summarise(overview: SavingsOverview): SavingsSummary {
  const mfHoldings = overview.holdings.filter((h) => h.kind === "mf");
  const mf = mfHoldings.length > 0 ? holdingTotals(mfHoldings) : null;
  const npsAccount = overview.accounts.find((a) => a.kind === "nps") ?? null;
  const npsHoldings = overview.holdings.filter((h) => h.kind === "nps");
  let nps: SavingsSummary["nps"] = null;
  if (npsAccount) {
    const fromUnits = npsHoldings.length > 0 ? holdingTotals(npsHoldings) : null;
    nps = {
      valuePaise: fromUnits ? fromUnits.valuePaise : (npsAccount.valuePaise ?? 0),
      investedPaise: null,
      asOf: npsAccount.asOf,
      navDate: fromUnits?.navDate ?? null,
      live: fromUnits?.live ?? false,
      contributedPaise: npsAccount.investedPaise,
      xirr: npsAccount.xirr,
      account: npsAccount.account,
    };
  }
  const pf = overview.accounts
    .filter((a) => a.kind === "pf")
    .map((account) => ({
      account,
      balancePaise: (account.ownPaise ?? 0) + (account.employerPaise ?? 0),
      estimatedPaise: pfEstimatedPaise(account, overview.months),
    }));
  const totalValuePaise = (mf?.valuePaise ?? 0) + (nps?.valuePaise ?? 0) + pf.reduce((sum, p) => sum + p.balancePaise, 0);
  return { mf, nps, pf, totalValuePaise };
}

// "4,068.7055" -> units text; units are shown with the decimals the statement had (three for a fund, four for NPS), trailing zeros dropped to three.
export function formatUnits(unitsE4: number, decimals: 3 | 4 = 3): string {
  const sign = unitsE4 < 0 ? "-" : "";
  const abs = Math.abs(unitsE4);
  const whole = Math.floor(abs / 1e4);
  let fraction = String(abs % 1e4).padStart(4, "0");
  fraction = decimals === 3 ? fraction.slice(0, 3) : fraction;
  return `${sign}${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

// How much a holding is worth above (or below) what was put in, and as a percentage of it; null when nothing is known to have been invested.
export function gainOf(valuePaise: number, investedPaise: number | null): { paise: number; percent: number | null } | null {
  if (investedPaise === null) return null;
  return { paise: valuePaise - investedPaise, percent: investedPaise > 0 ? ((valuePaise - investedPaise) / investedPaise) * 100 : null };
}

// "+₹46,229 (14.8%)" or "-₹2,490 (-1.7%)"
export function gainText(gain: { paise: number; percent: number | null }): string {
  const sign = gain.paise < 0 ? "-" : "+";
  const amount = `${sign}${wholeRupees(Math.abs(gain.paise))}`;
  return gain.percent === null ? amount : `${amount} (${gain.percent.toFixed(1)}%)`;
}

// An NPS scheme as the statement names it, without the "POP" marker the statement adds: "ICICI PENSION FUND SCHEME E - TIER I".
export const schemeLabel = (name: string): string => name.replace(/\s+POP$/i, "").trim();

// A fund as the CAS names it ("Axis ELSS- Tax Saver Fund - Regular Growth") split into a clean name and small tags (Regular or Direct, Growth or IDCW), so a
// row reads "Axis ELSS- Tax Saver Fund" with the plan and option beside it.
export function fundDisplay(name: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  if (/\bdirect\b/i.test(name)) tags.push("Direct");
  else if (/\bregular\b/i.test(name)) tags.push("Regular");
  if (/\bidcw\b|\bdividend\b/i.test(name)) tags.push("IDCW");
  else if (/\bgrowth\b/i.test(name)) tags.push("Growth");
  const title = name
    .replace(/\(\s*formerly[^)]*\)/gi, " ")
    .replace(/\s*[-–]?\s*\(?\s*\b(regular|direct)\b(\s+plan)?\s*\)?/gi, " ")
    .replace(/\s*[-–]?\s*\(?\s*\b(growth|idcw)\b(\s+(option|plan))?\s*\)?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–]\s*$/, "")
    .trim();
  return { title: title || name, tags };
}

const ACRONYMS = new Set(["ICICI", "SBI", "HDFC", "LIC", "UTI", "HSBC", "DSP", "IDFC", "NPS", "UTI"]);
const SCHEME_KINDS: Record<string, string> = { E: "Equity", C: "Corporate bonds", G: "Government securities", A: "Alternative assets" };
const titleCase = (text: string): string =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");

// An NPS scheme ("ICICI PENSION FUND SCHEME E - TIER I POP") as a title ("Scheme E · Equity") with its fund house and tier as tags.
export function npsSchemeDisplay(name: string): { title: string; tags: string[] } {
  const clean = schemeLabel(name);
  const m = clean.match(/^(.*?)\s+SCHEME\s+([A-Z])\b/i);
  if (!m) return { title: clean, tags: [] };
  const letter = m[2].toUpperCase();
  const tier = clean.match(/\bTIER\s+(I{1,2})\b/i);
  return { title: `Scheme ${letter} · ${SCHEME_KINDS[letter] ?? "Fund"}`, tags: [titleCase(m[1]), ...(tier ? [`Tier ${tier[1].toUpperCase()}`] : [])] };
}

// "93.7131"
export const formatNav = (navE4: number): string => `${Math.floor(navE4 / 1e4)}.${String(navE4 % 1e4).padStart(4, "0")}`;

// ---- text -------------------------------------------------------------------------------------------------------------------------------------------

// Whole rupees with Indian grouping: "₹1,05,124".
export const wholeRupees = (paise: number): string => formatRupeeAmount(Math.round(paise / 100));

export interface ImportCounts {
  what: string;
  unit?: "month" | "purchase"; // what added / updated / same count (months unless it says purchases)
  added: number;
  updated: number;
  same: number;
  kept: number;
  removed: number;
  notes: string[];
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// What an import did, in a few short lines for the page.
export function describeImport(r: ImportCounts): string[] {
  const parts: string[] = [];
  if (r.added > 0) parts.push(`${plural(r.added, r.unit ?? "month")} added`);
  if (r.updated > 0) parts.push(`${r.updated} changed`);
  if (r.removed > 0) parts.push(`${r.removed} removed`);
  if (r.kept > 0) parts.push(`${r.kept} kept as they were`);
  if (r.same > 0) parts.push(`${r.same} already there`);
  return [`${r.what}: ${parts.length > 0 ? parts.join(", ") : "read, with no monthly figures in it"}.`, ...r.notes];
}
