import { isNumberCell, isoFromPrinted, normaliseLine, parseScaled } from "./pdfLines";

// Reads the mutual fund part of a Consolidated Account Statement (CAS) from its text lines (see pdfLines.ts). Written against the CDSL CAS for October
// 2026 (the section "Mutual fund units held with MF/RTA"). It takes each fund's closing units, NAV, amount invested and value, and each purchase
// (a SIP or a lump sum) with its date and amount. A purchase is the money you put in, so a stamp duty is added to its amount ("5999.70" + "0.30" is
// the 6,000 that left your bank), and a redemption, a switch, a dividend reinvestment or a bonus is not one. The funds' values must add up to the
// statement's own grand total, or the statement is refused. Demat holdings and the NPS part (if there is one) are not read here.
export class MfCasError extends Error {}

export interface MfHolding {
  isin: string;
  folio: string;
  name: string; // without the scheme code ("Axis ELSS- Tax Saver Fund - Regular Growth")
  unitsE4: number; // units x 10,000 (statements print three decimals)
  navE4: number; // NAV x 10,000, on the statement's valuation date
  investedPaise: number | null; // the cumulative amount invested, when the statement prints it
  valuePaise: number;
}

export interface MfPurchase {
  date: string; // "2026-10-05"
  isin: string;
  amountPaise: number; // amount plus stamp duty
}

export interface MfCas {
  periodStart: string;
  periodEnd: string;
  valuationDate: string; // the date the units and values are as of
  holdings: MfHolding[];
  purchases: MfPurchase[];
}

export const isMfCas = (lines: readonly string[]): boolean => lines.some((l) => /CONSOLIDATED ACCOUNT STATEMENT/i.test(l)) && lines.some((l) => /MUTUAL FUND UNITS HELD/i.test(l));

const ISIN = /^INF[A-Z0-9]{9}$/;
const DATE = /^\d{2}-\d{2}-\d{4}$/;
// What a line above a purchase says when the units are not new money.
const NOT_NEW_MONEY = /switch|reinvest|dividend|idcw|bonus|merger|transfer/i;

function periodOf(lines: string[]): { start: string; end: string } | null {
  for (const line of lines) {
    const a = line.match(/FROM\s+(\d{2}-\d{2}-\d{4})\s*(?:\|\s*)?TO\s+(\d{2}-\d{2}-\d{4})/i);
    const b = line.match(/period from\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+to\s+(\d{2}-[A-Za-z]{3}-\d{4})/i);
    const m = a ?? b;
    const start = m ? isoFromPrinted(m[1]) : null;
    const end = m ? isoFromPrinted(m[2]) : null;
    if (start && end) return { start, end };
  }
  return null;
}

const nameOnly = (heading: string): string => heading.replace(/^[A-Z0-9]{1,8}\s+-\s+/, "").trim();

export function parseMfCas(rawLines: readonly string[]): MfCas {
  const lines = rawLines.map(normaliseLine).filter((l) => l !== "");
  const rtaAt = lines.findIndex((l) => /MUTUAL FUND UNITS HELD WITH MF\/RTA/i.test(l));
  const heldAt = lines.findIndex((l) => /MUTUAL FUND UNITS HELD AS ON/i.test(l));
  if (rtaAt < 0 || heldAt < 0) throw new MfCasError("No mutual fund section was found. Only the CDSL consolidated statement (CAS) is read so far.");
  const period = periodOf(lines);
  const valuation = lines[heldAt].match(/AS ON\s+(\d{2}-\d{2}-\d{4})/i);
  const valuationDate = valuation ? isoFromPrinted(valuation[1]) : null;
  if (!period || !valuationDate) throw new MfCasError("The statement's period could not be read.");

  // Each fund's heading ("TSGP - Axis ELSS- Tax Saver Fund - Regular Growth") is the line above its ISIN line; purchases are the dated rows after it.
  const names = new Map<string, string>();
  const purchases: MfPurchase[] = [];
  let isin: string | null = null;
  let pending: string[] = []; // text since the last dated row of this fund: where a purchase's type is printed
  for (let i = rtaAt + 1; i < heldAt; i++) {
    const line = lines[i];
    const isinCell = line.match(/^ISIN\s*:\s*\|\s*(INF[A-Z0-9]{9})\b/);
    if (isinCell) {
      isin = isinCell[1];
      if (i > 0 && !names.has(isin)) names.set(isin, nameOnly(lines[i - 1]));
      pending = [];
      continue;
    }
    if (/^Opening Balance/i.test(line) || /^Closing Balance/i.test(line)) {
      pending = [];
      continue;
    }
    const cells = line.split(" | ");
    if (isin && cells.length >= 8 && DATE.test(cells[0]) && cells.slice(-7).every(isNumberCell)) {
      const [amount, , , units, stamp] = cells.slice(-7);
      const text = `${pending.join(" ")} ${cells.slice(1, -7).join(" ")}`;
      const unitsE4 = parseScaled(units, 4);
      const amountPaise = parseScaled(amount, 2);
      const stampPaise = parseScaled(stamp, 2) ?? 0;
      const date = isoFromPrinted(cells[0]);
      if (unitsE4 !== null && unitsE4 > 0 && amountPaise !== null && amountPaise > 0 && date && !NOT_NEW_MONEY.test(text)) {
        purchases.push({ date, isin, amountPaise: amountPaise + stampPaise });
      }
      pending = [];
      continue;
    }
    pending.push(line);
  }

  const holdings: MfHolding[] = [];
  for (let i = heldAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^Grand Total/i.test(line)) break;
    const cells = line.split(" | ");
    const at = cells.findIndex((c) => ISIN.test(c));
    if (at < 0 || cells.length < at + 6) continue;
    const [folio, units, nav, invested, value] = cells.slice(at + 1, at + 6);
    const unitsE4 = parseScaled(units, 4);
    const navE4 = parseScaled(nav, 4);
    const valuePaise = parseScaled(value, 2);
    if (unitsE4 === null || navE4 === null || valuePaise === null) continue;
    holdings.push({
      isin: cells[at],
      folio,
      name: names.get(cells[at]) ?? cells[at],
      unitsE4,
      navE4,
      investedPaise: isNumberCell(invested) ? parseScaled(invested, 2) : null,
      valuePaise,
    });
  }
  if (holdings.length === 0) throw new MfCasError("No mutual fund holdings were found in the statement.");

  const grand = lines.slice(heldAt).find((l) => /^Grand Total/i.test(l));
  const totals = (grand?.split(" | ") ?? []).filter(isNumberCell);
  const printedValue = totals.length > 0 ? parseScaled(totals[totals.length - 1], 2) : null;
  const sum = holdings.reduce((acc, h) => acc + h.valuePaise, 0);
  if (printedValue === null || Math.abs(sum - printedValue) > 100) {
    throw new MfCasError("The funds in this statement do not add up to its own total, so it could not be read reliably and nothing was imported.");
  }

  return { periodStart: period.start, periodEnd: period.end, valuationDate, holdings, purchases };
}
