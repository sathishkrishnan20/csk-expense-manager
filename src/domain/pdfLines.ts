import type { PdfTextItem } from "./pdfStatement";

// The text of a PDF as lines, for the Savings statements (PF passbook, NPS statement, mutual fund CAS). Their tables are read by looking at one line at
// a time, so each line is the text pieces that share a baseline, left to right, joined with " | " (a cell border). Pure: the tests give it text and the
// PDF reader (src/pdf/readPdf.ts) gives it positions.
const ROW_TOLERANCE = 2.5;

// One cell border between pieces, nothing at the ends, single spaces: "| Mar-2026 | | CR |" and "Mar-2026 | CR" read the same.
export const normaliseLine = (line: string): string =>
  line.replace(/(?:\s*\|)+\s*/g, " | ").replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim();

export function pdfLines(pages: PdfTextItem[][]): string[] {
  const lines: string[] = [];
  for (const items of pages) {
    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const item of [...items].filter((i) => i.text.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r.y - item.y) <= ROW_TOLERANCE);
      if (row) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
    for (const row of rows.sort((a, b) => b.y - a.y)) {
      const text = normaliseLine(row.items.sort((a, b) => a.x - b.x).map((i) => i.text).join(" | "));
      if (text !== "") lines.push(text);
    }
  }
  return lines;
}

// A decimal number as text ("1,87,500", "5999.7", ".3", "(32.77)", "-2,489.56", "₹ 44.25") as an integer of 10^-scale: scale 2 gives paise, 4 gives the
// ten-thousandths a NAV and a unit balance are printed in. Done on the text, never through floating point. Null when it is not a number. Anything
// printed past `scale` decimals is rounded.
export function parseScaled(text: string, scale: number): number | null {
  let t = text.replace(/[₹,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  }
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [whole = "", fraction = ""] = t.split(".");
  let n = Number(whole || "0") * 10 ** scale + Number((fraction + "0".repeat(scale)).slice(0, scale) || "0");
  if (fraction.length > scale && fraction[scale] >= "5") n += 1;
  return negative ? -n : n;
}

// A cell that is only a number.
export const isNumberCell = (cell: string): boolean => /^\(?-?[\d,]*\.?\d+\)?$/.test(cell.trim());

const MONTHS_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// 1 to 12 for "Mar", "March" (capitals do not matter), or null.
export function monthNumber(name: string): number | null {
  const lower = name.trim().toLowerCase();
  const i = lower.length === 3 ? MONTHS_ABBR.indexOf(lower) : MONTHS_FULL.indexOf(lower);
  return i < 0 ? null : i + 1;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

// "13-11-2026" or "13/11/2026" -> "2026-11-13"; "13-Nov-2026" or "13-Nov-26" -> "2026-11-13"; null when it is not a date.
export function isoFromPrinted(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9}|\d{1,2})[-/ ,]+(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : monthNumber(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (!month || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// "Mar-2026" -> "2026-03" (a wage month); null otherwise.
export function monthFromWords(text: string): string | null {
  const m = text.trim().match(/^([A-Za-z]{3,9})[-, ]+(\d{4})$/);
  const month = m ? monthNumber(m[1]) : null;
  return m && month ? `${m[2]}-${pad2(month)}` : null;
}
