import Papa from "papaparse";

export interface ParsedTransaction {
  dedupeKey: string;
  txnDate: string; // ISO yyyy-mm-dd
  valueDate: string | null;
  direction: "debit" | "credit";
  amountPaise: number;
  balancePaise: number | null;
  narration: string;
  payee: string | null;
  vpa: string | null;
  note: string | null; // human-typed UPI remark; null when empty/generic/auto-generated
  payeeBank: string | null;
  upiRef: string | null;
}

export class StatementParseError extends Error {}

export interface ParseResult {
  rows: ParsedTransaction[];
  skippedLines: number;
}

interface ColumnMap {
  txnDate: number;
  valueDate: number | null;
  narration: number;
  debit: number;
  credit: number;
  balance: number | null;
}

// Layout of the bank export we have seen: serial, txn date, value date,
// cheque/ref (blank), narration, debit, credit, balance. Used when the file
// has no recognisable header row.
const POSITIONAL: ColumnMap = { txnDate: 1, valueDate: 2, narration: 4, debit: 5, credit: 6, balance: 7 };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let d: number, m: number, y: number;

  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[a-z]*[\s\-/,]+(\d{2,4})$/))) {
    d = Number(match[1]);
    m = MONTHS.indexOf(match[2].toLowerCase()) + 1;
    y = Number(match[3]);
  } else {
    return null;
  }

  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Money is held as integer paise to avoid float drift.
export function parseAmountPaise(raw: string | undefined): number | null {
  const cleaned = (raw ?? "").replace(/[,\s₹]|Rs\.?|INR/gi, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const GENERIC_NOTE = /^(upi|payment|pay|paid|na|n\/a|nil|-)$/i;
const AUTO_CODE = /^[A-Z]?\d{6,}$|^[A-Za-z0-9]{16,}$/;

function cleanNote(raw: string): string | null {
  const note = raw.trim();
  if (!note || GENERIC_NOTE.test(note) || AUTO_CODE.test(note)) return null;
  return note;
}

export interface UpiFields {
  payee: string | null;
  vpa: string | null;
  note: string | null;
  payeeBank: string | null;
  upiRef: string | null;
}

const EMPTY_UPI: UpiFields = { payee: null, vpa: null, note: null, payeeBank: null, upiRef: null };

// Narration shape: UPI/<payee>/<vpa>/<note>/<bank>/<12-digit ref>/<bank txn id>.
// Anchored on the 12-digit ref so a "/" inside the note doesn't shift fields.
export function parseUpiNarration(narration: string): UpiFields {
  const parts = narration.split("/").map((p) => p.trim());
  if (parts[0]?.toUpperCase() !== "UPI" || parts.length < 4) return EMPTY_UPI;

  const refIdx = parts.findIndex((p, i) => i >= 3 && /^\d{12}$/.test(p));
  if (refIdx === -1) {
    return { ...EMPTY_UPI, payee: parts[1] || null, vpa: parts[2] || null, note: cleanNote(parts[3] ?? "") };
  }
  return {
    payee: parts[1] || null,
    vpa: parts[2] || null,
    note: cleanNote(parts.slice(3, refIdx - 1).join("/")),
    payeeBank: parts[refIdx - 1] || null,
    upiRef: parts[refIdx],
  };
}

// Only UPI is recognised from the narration; other rows are left blank for the
// user to fill in rather than guessed.
export function inferPaymentMethod(narration: string): string | null {
  return /^UPI\b/i.test(narration.trim()) ? "UPI" : null;
}

export function buildDedupeKey(t: Omit<ParsedTransaction, "dedupeKey">): string {
  const dir = t.direction === "debit" ? "D" : "C";
  if (t.upiRef) return `upi:${t.upiRef}:${dir}`;
  const narration = t.narration.toLowerCase().replace(/\s+/g, " ");
  return `row:${t.txnDate}|${dir}|${t.amountPaise}|${t.balancePaise ?? ""}|${narration}`;
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let best = ",";
  let bestScore = -1;
  for (const candidate of [",", "\t", ";", "|"]) {
    const score = lines.filter((l) => l.split(candidate).length >= 6).length;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function findHeader(grid: string[][]): { index: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(grid.length, 60); i++) {
    const cells = grid[i].map((c) => c.trim().toLowerCase());
    const narration = cells.findIndex((c) => /narration|description|particulars|remarks|details/.test(c));
    const debit = cells.findIndex((c) => /debit|withdrawal/.test(c));
    const credit = cells.findIndex((c) => /credit|deposit/.test(c));
    if (narration === -1 || debit === -1 || credit === -1) continue;

    const valueDate = cells.findIndex((c) => /value.*date/.test(c));
    const txnDate = cells.findIndex((c, idx) => /date/.test(c) && idx !== valueDate);
    if (txnDate === -1) continue;
    const balance = cells.findIndex((c) => /balance/.test(c));
    return {
      index: i,
      map: {
        txnDate,
        valueDate: valueDate === -1 ? null : valueDate,
        narration,
        debit,
        credit,
        balance: balance === -1 ? null : balance,
      },
    };
  }
  return null;
}

function assertTextFile(text: string) {
  if (text.includes("\u0000") || text.startsWith("PK") || text.startsWith("ÐÏ\u0011à")) {
    throw new StatementParseError(
      "This looks like a binary Excel file. Export or save the statement as CSV and try again.",
    );
  }
  if (/<table/i.test(text.slice(0, 3000))) {
    throw new StatementParseError(
      "This file is an HTML table saved with an .xls extension. Export the statement as CSV instead.",
    );
  }
}

// ICICI and some other banks split long narration text across multiple rows.
// A continuation row has text in exactly one cell while every other cell is
// empty; we append that text to the same column of the preceding row.
function mergeContinuationRows(grid: string[][]): string[][] {
  const merged: string[][] = [];
  for (const row of grid) {
    const filledIndices: number[] = [];
    for (let i = 0; i < row.length; i++) {
      if (row[i].trim() !== "") filledIndices.push(i);
    }
    if (filledIndices.length === 1 && merged.length > 0) {
      const col = filledIndices[0];
      merged[merged.length - 1] = [...merged[merged.length - 1]];
      merged[merged.length - 1][col] = (merged[merged.length - 1][col] ?? "") + row[col];
    } else {
      merged.push(row);
    }
  }
  return merged;
}

export function parseStatement(input: string): ParseResult {
  const text = input.replace(/^﻿/, "");
  assertTextFile(text);

  const delimiter = detectDelimiter(text);
  const grid = mergeContinuationRows(
    Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data,
  );

  const header = findHeader(grid);
  const map = header?.map ?? POSITIONAL;
  const dataRows = header ? grid.slice(header.index + 1) : grid;

  const rows: ParsedTransaction[] = [];
  let skippedLines = 0;

  for (const cells of dataRows) {
    const txnDate = parseDate(cells[map.txnDate] ?? "");
    const narration = (cells[map.narration] ?? "").trim();
    const debit = parseAmountPaise(cells[map.debit]);
    const credit = parseAmountPaise(cells[map.credit]);

    if (!txnDate || !narration || debit === null || credit === null || (debit === 0 && credit === 0)) {
      skippedLines++;
      continue;
    }

    const direction = debit > 0 ? "debit" : "credit";
    const upi = parseUpiNarration(narration);
    const partial = {
      txnDate,
      valueDate: map.valueDate === null ? null : parseDate(cells[map.valueDate] ?? ""),
      direction,
      amountPaise: direction === "debit" ? debit : credit,
      balancePaise: map.balance === null ? null : parseAmountPaise(cells[map.balance]) || null,
      narration,
      ...upi,
    } satisfies Omit<ParsedTransaction, "dedupeKey">;

    rows.push({ ...partial, dedupeKey: buildDedupeKey(partial) });
  }

  if (rows.length === 0) {
    throw new StatementParseError(
      "No transactions found. Check this is the bank's statement CSV (date, narration, debit, credit columns).",
    );
  }
  return { rows, skippedLines };
}
