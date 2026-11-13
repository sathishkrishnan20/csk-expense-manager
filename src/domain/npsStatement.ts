import { isoFromPrinted, monthNumber, normaliseLine, parseScaled } from "./pdfLines";

// Reads the "NPS Transaction Statement" (Tier I) that the Protean CRA site gives, from its text lines (see pdfLines.ts). Written against a statement
// from April 1 to November 13, 2026. What it takes: the PRAN, the period, the account's value and total contribution, the units and NAV of each scheme
// (kept so the value can be worked out from a later NAV), and each month's contribution (employee and employer). The scheme split, the charges and
// the unit-by-unit transactions are not kept. The schemes' values must add up to the account's value, or the statement is refused.
export class NpsStatementError extends Error {}

export interface NpsHolding {
  name: string; // as the statement prints it, such as "ICICI PENSION FUND SCHEME E - TIER I POP"
  unitsE4: number; // units x 10,000
  navE4: number; // NAV x 10,000, on navDate
  valuePaise: number;
}

export interface NpsContribution {
  month: string; // the month it is for, "2026-05"
  creditedDate: string | null; // the earliest day a credit for that month was posted
  ownPaise: number; // the employee's part
  employerPaise: number;
}

export interface NpsStatement {
  pran: string;
  periodStart: string;
  periodEnd: string;
  navDate: string | null;
  valuePaise: number;
  contributedPaise: number; // everything put in since the account began
  xirr: string | null; // the statement's own return figure, as printed ("5.24")
  holdings: NpsHolding[];
  contributions: NpsContribution[]; // oldest first
}

export const isNpsStatement = (lines: readonly string[]): boolean => lines.some((l) => /NPS TRANSACTION/i.test(l)) && lines.some((l) => /\bPRAN\b/.test(l));

const WORD_DATE = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;
function isoFromWords(text: string): string | null {
  const m = text.trim().match(WORD_DATE);
  const month = m ? monthNumber(m[1]) : null;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

const MONEY = /^[\d,]+\.\d{2}$/;
const PAISE = (text: string): number => {
  const v = parseScaled(text, 2);
  if (v === null) throw new NpsStatementError("A number in the statement could not be read.");
  return v;
};

const HOLDING = /^(.+?)\s*\|\s*([\d,]+\.\d{2})\s*\|\s*([\d,]+\.\d{4})\s*\|\s*([\d,]+\.\d{4})$/;
const CONTRIBUTION = /^(?:(\d{1,2}-[A-Za-z]{3}-\d{4})\s*\|\s*)?For ([A-Za-z]+),\s*(\d{4})\s*\|\s*(.*?)\s*\|?\s*([\d,]+\.\d{2})\s*\|\s*([\d,]+\.\d{2})\s*\|\s*([\d,]+\.\d{2})$/;

export function parseNpsStatement(rawLines: readonly string[]): NpsStatement {
  const lines = rawLines.map(normaliseLine).filter((l) => l !== "");
  const text = lines.join("\n");

  if (/Tier II Account/i.test(text) && !/Tier I Account/i.test(text)) throw new NpsStatementError("Only the Tier I statement is read. This one is for Tier II.");
  const pran = text.match(/\bPRAN\s*\|\s*(\d{12})\b/)?.[1];
  if (!pran) throw new NpsStatementError("This does not look like an NPS transaction statement (no PRAN found).");

  const period = text.match(/([A-Za-z]+ \d{1,2}, \d{4})\s*\|\s*to\s*\|\s*([A-Za-z]+ \d{1,2}, \d{4})/);
  const periodStart = period ? isoFromWords(period[1]) : null;
  const periodEnd = period ? isoFromWords(period[2]) : null;
  if (!periodStart || !periodEnd) throw new NpsStatementError("The statement's period could not be read.");
  const navOn = text.match(/NAV as on (\d{2}-[A-Za-z]{3}-\d{4})/);
  const navDate = navOn ? isoFromPrinted(navOn[1]) : null;

  // The summary row: value, number of contributions, total contribution, withdrawal, gain, charges. Its amounts have ₹ before them.
  const summaryAt = lines.findIndex((l) => /Investment Summary/i.test(l));
  const summaryLine = lines.slice(summaryAt + 1).find((l) => (l.match(/\d[\d,]*\.\d{2}/g) ?? []).length >= 4 && l.includes("₹"));
  const amounts = (summaryLine?.match(/[\d,]+\.\d{2}/g) ?? []).map(PAISE);
  if (summaryAt < 0 || amounts.length < 3) throw new NpsStatementError("The statement's investment summary could not be read.");
  const valuePaise = amounts[0];
  const contributedPaise = amounts[1];
  const holdingsAt = lines.findIndex((l) => /Scheme Wise Summary/i.test(l));
  // The return figure is printed in the summary's heading, as "... | 5.24%".
  const xirrValue =
    lines
      .slice(summaryAt + 1, holdingsAt < 0 ? undefined : holdingsAt)
      .map((l) => l.match(/(\d+\.\d+)%$/)?.[1])
      .find((v) => v !== undefined) ?? null;

  const holdings: NpsHolding[] = [];
  for (const line of lines.slice(holdingsAt < 0 ? lines.length : holdingsAt + 1)) {
    if (/^In case of debit of units/i.test(line)) break;
    const m = line.match(HOLDING);
    if (!m) continue;
    const unitsE4 = parseScaled(m[3], 4);
    const navE4 = parseScaled(m[4], 4);
    if (unitsE4 === null || navE4 === null) continue;
    const value = PAISE(m[2]);
    // Units x NAV must give the printed value to within a rupee.
    if (Math.abs(Math.round((unitsE4 * navE4) / 1e6) - value) > 100) throw new NpsStatementError(`The units and NAV of ${m[1]} do not give its printed value, so the statement could not be read reliably.`);
    holdings.push({ name: m[1].trim(), unitsE4, navE4, valuePaise: value });
  }
  if (holdings.length === 0) throw new NpsStatementError("No scheme holdings were found in the statement.");
  const holdingsTotal = holdings.reduce((sum, h) => sum + h.valuePaise, 0);
  if (Math.abs(holdingsTotal - valuePaise) > 100) throw new NpsStatementError("The schemes do not add up to the account's value, so the statement could not be read reliably and nothing was imported.");

  const byMonth = new Map<string, NpsContribution>();
  const from = lines.findIndex((l) => /^Contribution\/Redemption Details/i.test(l));
  const to = lines.findIndex((l, i) => i > from && /^Transaction Details$/i.test(l));
  if (from >= 0) {
    const section = lines.slice(from + 1, to < 0 ? undefined : to);
    section.forEach((line, i) => {
      const m = line.match(CONTRIBUTION);
      if (!m) return;
      const month = monthNumber(m[2]);
      if (!month || !MONEY.test(m[5]) || !MONEY.test(m[6]) || !MONEY.test(m[7])) return;
      const own = PAISE(m[5]);
      const employer = PAISE(m[6]);
      if (own + employer !== PAISE(m[7])) throw new NpsStatementError(`The contribution for ${m[2]} ${m[3]} does not add up, so the statement could not be read reliably.`);
      // A date that did not fit on the row's line is split over the line before ("01-Sep-") and the line after ("2026").
      let credited = m[1] ? isoFromPrinted(m[1]) : null;
      if (!credited && /^\d{1,2}-[A-Za-z]{3}-?$/.test(section[i - 1] ?? "") && /^\d{4}$/.test(section[i + 1] ?? "")) {
        credited = isoFromPrinted(`${section[i - 1].replace(/-$/, "")}-${section[i + 1]}`);
      }
      const key = `${m[3]}-${String(month).padStart(2, "0")}`;
      const had = byMonth.get(key);
      byMonth.set(key, {
        month: key,
        creditedDate: had?.creditedDate && credited ? (had.creditedDate < credited ? had.creditedDate : credited) : (had?.creditedDate ?? credited),
        ownPaise: (had?.ownPaise ?? 0) + own,
        employerPaise: (had?.employerPaise ?? 0) + employer,
      });
    });
  }

  return {
    pran,
    periodStart,
    periodEnd,
    navDate,
    valuePaise,
    contributedPaise,
    xirr: xirrValue,
    holdings,
    contributions: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
