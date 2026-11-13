import { isoFromPrinted, monthFromWords, normaliseLine, parseScaled } from "./pdfLines";

// Reads the EPF "Member Passbook" PDF that the EPFO member portal and UMANG give (one per member ID and financial year), from its text lines
// (see pdfLines.ts). Written against the 2025-26 and 2026-27 passbooks. Each month's row is a contribution: the wage month, the date it was credited,
// and the employee, employer and pension amounts. Amounts are in whole rupees; everything here is in paise. Nothing is guessed: the rows must add
// up to the passbook's own "Total Contributions", and the balances must follow from the opening balance, or the passbook is refused.
export class PfPassbookError extends Error {}

export interface PfShare {
  ownPaise: number; // the employee's share
  employerPaise: number;
  pensionPaise: number; // the pension (EPS) share; it is not part of the balance you can withdraw, so it is kept apart
}

export interface PfContribution extends PfShare {
  month: string; // the wage month, "2026-03"
  creditedDate: string; // "2026-04-01"
}

export interface PfPassbook {
  memberId: string;
  establishmentId: string | null;
  fyStart: number; // 2026 for the passbook of 2026-27
  printedOn: string; // "2026-11-13": the day the balance is as of
  opening: PfShare;
  closing: PfShare; // as of printedOn, including the interest credited so far
  contributions: PfContribution[]; // one per wage month, newest last
}

const ROW = /^([A-Za-z]{3}-\d{4})\s*(?:\|\s*)?(\d{2}-\d{2}-\d{4})\s*\|\s*(CR|DR)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)$/;

// The last three numbers of a line: the employee, employer and pension columns.
function shares(line: string, what: string): PfShare {
  const cells = line.split(" | ").map((c) => c.trim()).filter((c) => /^[\d,]+$/.test(c));
  if (cells.length < 3) throw new PfPassbookError(`The passbook's "${what}" line could not be read.`);
  const [own, employer, pension] = cells.slice(-3).map((c) => (parseScaled(c, 2) ?? NaN));
  if (![own, employer, pension].every(Number.isFinite)) throw new PfPassbookError(`The passbook's "${what}" line could not be read.`);
  return { ownPaise: own, employerPaise: employer, pensionPaise: pension };
}

const add = (a: PfShare, b: PfShare): PfShare => ({
  ownPaise: a.ownPaise + b.ownPaise,
  employerPaise: a.employerPaise + b.employerPaise,
  pensionPaise: a.pensionPaise + b.pensionPaise,
});
const sameShare = (a: PfShare, b: PfShare): boolean => a.ownPaise === b.ownPaise && a.employerPaise === b.employerPaise && a.pensionPaise === b.pensionPaise;

export const isPfPassbook = (lines: readonly string[]): boolean => lines.some((l) => /Member Passbook/i.test(l)) && lines.some((l) => /EPF Passbook/i.test(l));

export function parsePfPassbook(rawLines: readonly string[]): PfPassbook {
  const lines = rawLines.map(normaliseLine).filter((l) => l !== "");
  const find = (re: RegExp): RegExpMatchArray | null => {
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m;
    }
    return null;
  };

  const member = find(/Member ID\/Name\s*\|?\s*([A-Z0-9]{10,})/);
  if (!member) throw new PfPassbookError("This does not look like an EPF member passbook (no member ID found).");
  const establishment = find(/Establishment ID\/Name\s*\|?\s*([A-Z0-9]{8,})/);
  const fy = find(/Financial Year\s*-\s*(\d{4})-(\d{4})/);
  const printed = find(/Printed On\s*:?\s*\|?\s*(\d{2}-\d{2}-\d{4})/);
  const printedOn = printed ? isoFromPrinted(printed[1]) : null;
  if (!fy || !printedOn) throw new PfPassbookError("The passbook's financial year or print date could not be read.");

  const opening = lines.find((l) => /^OB Int\. Updated upto/i.test(l));
  const closing = lines.find((l) => /^Closing Balance as on/i.test(l));
  const totalContributions = lines.find((l) => /^Total Contributions for the year/i.test(l));
  const totalTransfers = lines.find((l) => /^Total Transfer-Ins/i.test(l));
  const totalWithdrawals = lines.find((l) => /^Total Withdrawals for the year/i.test(l));
  const interest = lines.find((l) => /^Int\. Updated upto/i.test(l));
  if (!opening || !closing || !totalContributions) throw new PfPassbookError("The passbook's balances could not be found, so nothing was read.");

  const contributions: PfContribution[] = [];
  for (const line of lines) {
    const m = line.match(ROW);
    if (!m || m[3] !== "CR") continue;
    const month = monthFromWords(m[1]);
    const creditedDate = isoFromPrinted(m[2]);
    // The 5 amounts of a row are EPF wages (m[4]), EPS wages (m[5]), then the employee (m[6]), employer (m[7]) and pension (m[8]) shares.
    const own = parseScaled(m[6], 2);
    const er = parseScaled(m[7], 2);
    const eps = parseScaled(m[8], 2);
    if (!month || !creditedDate || own === null || er === null || eps === null) continue;
    contributions.push({ month, creditedDate, ownPaise: own, employerPaise: er, pensionPaise: eps });
  }
  // Two credits for one wage month (an arrear paid later) are one month's contribution.
  const byMonth = new Map<string, PfContribution>();
  for (const c of contributions) {
    const had = byMonth.get(c.month);
    byMonth.set(c.month, had ? { ...add(had, c), month: c.month, creditedDate: had.creditedDate < c.creditedDate ? had.creditedDate : c.creditedDate } : c);
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));

  const none: PfShare = { ownPaise: 0, employerPaise: 0, pensionPaise: 0 };
  const sum = months.reduce<PfShare>((acc, c) => add(acc, c), none);
  const printedTotal = shares(totalContributions, "Total Contributions");
  if (!sameShare(sum, printedTotal)) {
    throw new PfPassbookError("The months in this passbook do not add up to its own total, so it could not be read reliably and nothing was imported.");
  }
  const open = shares(opening, "opening balance");
  const close = shares(closing, "closing balance");
  const expected = add(add(open, printedTotal), shares(interest ?? "Int. | 0 | 0 | 0", "interest"));
  const moved = add(expected, shares(totalTransfers ?? "x | 0 | 0 | 0", "transfers"));
  const withdrawn = shares(totalWithdrawals ?? "x | 0 | 0 | 0", "withdrawals");
  const after: PfShare = {
    ownPaise: moved.ownPaise - withdrawn.ownPaise,
    employerPaise: moved.employerPaise - withdrawn.employerPaise,
    pensionPaise: moved.pensionPaise - withdrawn.pensionPaise,
  };
  if (!sameShare(after, close)) {
    throw new PfPassbookError("The balances in this passbook do not follow from its opening balance, so it could not be read reliably and nothing was imported.");
  }

  return {
    memberId: member[1],
    establishmentId: establishment ? establishment[1] : null,
    fyStart: Number(fy[1]),
    printedOn,
    opening: open,
    closing: close,
    contributions: months,
  };
}
