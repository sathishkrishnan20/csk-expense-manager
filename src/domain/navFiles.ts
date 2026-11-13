import { isoFromPrinted, parseScaled } from "./pdfLines";
import type { SavingsHolding } from "./savings";

// Reads the two daily NAV files the live value uses (see rates/navApi.ts). Pure: they take the text of a file.
//
// AMFI's NAVAll.txt (https://portal.amfiindia.com/spages/NAVAll.txt): semicolon-separated, one scheme plan per line,
//   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;...;Net Asset Value;Date
// The columns between the name and the NAV have changed over the years, so the NAV is read as the second-last cell and the date as the last.
//
// NPS Trust's NAV report (https://npstrust.org.in/nav-report-excel): tab-separated,
//   ID, DATE OF NAV, PFM NAME, SCHEME ID, SCHEME NAME, NAV VALUE
export interface NavQuote {
  navE4: number; // NAV x 10,000
  date: string; // the day the NAV is for, "2026-11-12"
}

// The NAV of each wanted ISIN found in the file. A fund appears once per plan and option, each with its own ISIN; both ISIN columns are matched, and
// when a file lists one ISIN twice the newest date wins.
export function parseAmfiNavs(text: string, wanted: ReadonlySet<string>): Map<string, NavQuote> {
  const found = new Map<string, NavQuote>();
  if (wanted.size === 0) return found;
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(";");
    if (cells.length < 6) continue;
    const isins = [cells[1], cells[2]].map((c) => c.trim()).filter((c) => wanted.has(c));
    if (isins.length === 0) continue;
    const navE4 = parseScaled(cells[cells.length - 2], 4);
    const date = isoFromPrinted(cells[cells.length - 1]);
    if (navE4 === null || navE4 <= 0 || !date) continue; // "N.A." and the like
    for (const isin of isins) {
      const had = found.get(isin);
      if (!had || date > had.date) found.set(isin, { navE4, date });
    }
  }
  return found;
}

export interface NpsNavRow {
  schemeId: string;
  name: string;
  navE4: number;
  date: string;
}

export function parseNpsNavs(text: string): NpsNavRow[] {
  const rows: NpsNavRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split("\t").map((c) => c.trim());
    if (cells.length < 6 || !/^SM\w+/.test(cells[3])) continue;
    const navE4 = parseScaled(cells[5], 4);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(cells[1]) ? cells[1] : null;
    if (navE4 === null || navE4 <= 0 || !date) continue;
    rows.push({ schemeId: cells[3], name: cells[4], navE4, date });
  }
  return rows;
}

// The statement calls a scheme "ICICI PENSION FUND SCHEME E - TIER I POP" and the NAV report "ICICI PRUDENTIAL PENSION FUND  SCHEME E - TIER I": the
// same words in capitals once the fund house's long name, the "POP" marker and the spacing are set aside.
export const normaliseSchemeName = (name: string): string =>
  name
    .toUpperCase()
    .replace(/\bPRUDENTIAL\b/g, " ")
    .replace(/\bPOP\b/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();

// The one NAV row for a statement's scheme name, or null when none matches or more than one does (a guess could price the wrong scheme).
export function matchNpsScheme(statementName: string, rows: readonly NpsNavRow[]): NpsNavRow | null {
  const wanted = normaliseSchemeName(statementName);
  const matches = rows.filter((r) => normaliseSchemeName(r.name) === wanted);
  return matches.length === 1 ? matches[0] : null;
}

// A newer NAV for one holding.
export interface NavUpdate {
  kind: "mf" | "nps";
  account: string;
  code: string;
  navE4: number;
  date: string;
}

// The newer NAVs the two files give for the holdings the owner has: each fund by its ISIN, each NPS scheme by its name. A holding the file does not
// have (or has twice), or whose file NAV is not newer than the statement's, is left out, so the page keeps showing the statement's own value for it.
export function navUpdatesFor(holdings: readonly SavingsHolding[], amfiText: string | null, npsText: string | null): NavUpdate[] {
  const updates: NavUpdate[] = [];
  const mf = holdings.filter((h) => h.kind === "mf");
  if (amfiText && mf.length > 0) {
    const quotes = parseAmfiNavs(amfiText, new Set(mf.map((h) => h.code)));
    for (const h of mf) {
      const q = quotes.get(h.code);
      if (q && (h.navDate === null || q.date >= h.navDate)) updates.push({ kind: "mf", account: h.account, code: h.code, navE4: q.navE4, date: q.date });
    }
  }
  const nps = holdings.filter((h) => h.kind === "nps");
  if (npsText && nps.length > 0) {
    const rows = parseNpsNavs(npsText);
    for (const h of nps) {
      const row = matchNpsScheme(h.name, rows);
      if (row && (h.navDate === null || row.date >= h.navDate)) updates.push({ kind: "nps", account: h.account, code: h.code, navE4: row.navE4, date: row.date });
    }
  }
  return updates;
}
