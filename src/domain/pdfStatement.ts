// Reads the table of a bank statement PDF from positioned text (what a PDF text extractor such as
// pdf.js returns), so it can be tested without a PDF. Written against the ICICI savings-account
// statement: columns DATE, MODE, PARTICULARS, DEPOSITS, WITHDRAWALS, BALANCE, where one transaction
// is several lines of PARTICULARS text with the date and amounts on a line in the middle of them.
// Columns are found from the header row, not from fixed positions, so a similar layout from another
// bank may work too.
import {
  buildDedupeKey,
  inferPaymentMethod,
  parseAmountPaise,
  parseDate,
  parseUpiNarration,
  type ParsedTransaction,
} from "./statementParser";

export interface PdfTextItem {
  text: string;
  x: number; // left edge, PDF points
  y: number; // baseline, PDF points (larger = higher on the page)
  width: number;
}

export class PdfStatementError extends Error {}

export interface PdfStatementResult {
  rows: ParsedTransaction[];
  openingBalancePaise: number | null;
  closingBalancePaise: number | null; // balance after the last transaction
  printed: { depositsPaise: number; withdrawalsPaise: number; balancePaise: number } | null; // the bank's TOTAL row
  // Empty when every check passed: the balance after each row follows from the one before, and the
  // sums match the bank's own totals. Anything here means the numbers cannot be trusted as read.
  warnings: string[];
}

interface Row {
  y: number;
  items: PdfTextItem[]; // sorted by x
}

interface Columns {
  dateX: number;
  narrationX: number;
  amountLeft: number; // left edge of the first amount column
  deposit: number; // right edges of the amount columns
  withdrawal: number;
  balance: number;
}

const ROW_TOLERANCE = 2.5;
const DATE = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/;
const AMOUNT = /^-?[\d,]+\.\d{2}$/;

function toRows(items: PdfTextItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of [...items].filter((i) => i.text.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= ROW_TOLERANCE);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows.sort((a, b) => b.y - a.y);
}

function findColumns(row: Row): Columns | null {
  const pick = (re: RegExp) => row.items.find((i) => re.test(i.text.trim()));
  const date = pick(/^date$/i);
  const narration = pick(/^(particulars|narration|description|remarks|transaction remarks|details)$/i);
  const deposit = pick(/^(deposits?|credits?)\b/i);
  const withdrawal = pick(/^(withdrawals?|debits?)\b/i);
  const balance = pick(/^(balance|closing balance)\b/i);
  if (!date || !narration || !deposit || !withdrawal || !balance) return null;
  return {
    dateX: date.x,
    narrationX: narration.x,
    amountLeft: Math.min(deposit.x, withdrawal.x, balance.x),
    deposit: deposit.x + deposit.width,
    withdrawal: withdrawal.x + withdrawal.width,
    balance: balance.x + balance.width,
  };
}

// Which amount column an amount belongs to, by its right edge (amounts are right-aligned).
function amountColumn(item: PdfTextItem, c: Columns): "deposit" | "withdrawal" | "balance" | null {
  const edge = item.x + item.width;
  const options = [
    ["deposit", c.deposit],
    ["withdrawal", c.withdrawal],
    ["balance", c.balance],
  ] as const;
  const [name, at] = options.reduce((best, o) => (Math.abs(o[1] - edge) < Math.abs(best[1] - edge) ? o : best));
  return Math.abs(at - edge) <= 20 ? name : null;
}

interface Anchor {
  y: number;
  date: string;
  deposit: number | null;
  withdrawal: number | null;
  balance: number | null;
  narration: Row[]; // filled in below
}

const narrationText = (row: Row, c: Columns): string =>
  row.items
    .filter((i) => i.x >= c.narrationX - 8 && i.x < c.amountLeft - 5)
    .map((i) => i.text.trim())
    .join(" ");

// Splits the narration lines (top to bottom) between the anchors (top to bottom) so that every
// anchor gets a run of consecutive lines centred on its own height. Dynamic programming over
// "first i lines go to the first j anchors"; cost is how far the lines sit from their anchor.
function assignLines(lineYs: number[], anchorYs: number[]): number[] {
  const n = lineYs.length;
  const m = anchorYs.length;
  if (m === 0) return [];
  const MAX_GROUP = 12;
  const cost = (from: number, to: number, a: number): number => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += (lineYs[i] - anchorYs[a]) ** 2;
    const mean = (lineYs.slice(from, to).reduce((s, v) => s + v, 0)) / (to - from);
    return sum + 4 * (to - from) * (mean - anchorYs[a]) ** 2;
  };

  const best: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  best[0][0] = 0;
  for (let j = 1; j <= m; j++) {
    for (let i = j; i <= n; i++) {
      for (let k = Math.max(j - 1, i - MAX_GROUP); k < i; k++) {
        if (best[k][j - 1] === Infinity) continue;
        const c = best[k][j - 1] + cost(k, i, j - 1);
        if (c < best[i][j]) {
          best[i][j] = c;
          cut[i][j] = k;
        }
      }
    }
  }
  if (best[n][m] === Infinity) return lineYs.map((y) => anchorYs.reduce((bi, a, idx) => (Math.abs(a - y) < Math.abs(anchorYs[bi] - y) ? idx : bi), 0));

  const owner = Array<number>(n).fill(0);
  let i = n;
  for (let j = m; j >= 1; j--) {
    const k = cut[i][j];
    for (let t = k; t < i; t++) owner[t] = j - 1;
    i = k;
  }
  return owner;
}

export function parseStatementPdf(pages: PdfTextItem[][]): PdfStatementResult {
  const warnings: string[] = [];
  const anchors: Anchor[] = [];
  let columns: Columns | null = null;
  let printed: PdfStatementResult["printed"] = null;
  let open = false; // inside the transaction table
  let done = false;

  for (const page of pages) {
    if (done) break;
    const rows = toRows(page);
    const headerAt = rows.findIndex((r) => findColumns(r) !== null);
    if (headerAt >= 0) {
      columns = findColumns(rows[headerAt]);
      open = true;
    } else if (!open) {
      continue;
    }
    if (!columns) continue;
    const c = columns;
    let body = headerAt >= 0 ? rows.slice(headerAt + 1) : rows;

    const totalAt = body.findIndex((r) => /^total$/i.test(narrationText(r, c)));
    if (totalAt >= 0) {
      const amounts: Partial<Record<"deposit" | "withdrawal" | "balance", number>> = {};
      for (const item of body[totalAt].items) {
        const col = AMOUNT.test(item.text.trim()) ? amountColumn(item, c) : null;
        const paise = col ? parseAmountPaise(item.text) : null;
        if (col && paise !== null) amounts[col] = paise;
      }
      printed = {
        depositsPaise: amounts.deposit ?? 0,
        withdrawalsPaise: amounts.withdrawal ?? 0,
        balancePaise: amounts.balance ?? 0,
      };
      body = body.slice(0, totalAt);
      done = true;
    }

    // The anchors of this page: rows that carry a date.
    const pageAnchors: Anchor[] = [];
    for (const row of body) {
      const dateItem = row.items.find((i) => i.x < c.narrationX - 3 && DATE.test(i.text.trim()));
      if (!dateItem) continue;
      const date = parseDate(dateItem.text);
      if (!date) continue;
      const a: Anchor = { y: row.y, date, deposit: null, withdrawal: null, balance: null, narration: [] };
      for (const item of row.items) {
        if (!AMOUNT.test(item.text.trim())) continue;
        const col = amountColumn(item, c);
        const paise = parseAmountPaise(item.text);
        if (col && paise !== null) a[col] = paise;
      }
      pageAnchors.push(a);
    }

    // Narration lines of this page, shared out between its anchors.
    const lines = body.filter((r) => narrationText(r, c) !== "");
    const owner = assignLines(
      lines.map((l) => l.y),
      pageAnchors.map((a) => a.y),
    );
    lines.forEach((line, idx) => {
      const target = pageAnchors[owner[idx]] ?? anchors[anchors.length - 1];
      target?.narration.push(line);
    });
    anchors.push(...pageAnchors);
  }

  if (!columns || anchors.length === 0) {
    throw new PdfStatementError(
      "Could not find a transaction table in this PDF. It may be a statement layout the app does not read yet.",
    );
  }
  const c = columns;

  // The first dated row is the opening balance ("B/F") when it has no deposit or withdrawal.
  let opening: number | null = null;
  const rows: ParsedTransaction[] = [];
  const checked: { date: string; deposit: number; withdrawal: number; balance: number | null }[] = [];

  for (const [index, a] of anchors.entries()) {
    const narration = a.narration.map((l) => narrationText(l, c)).join(" ").replace(/\s+/g, " ").trim();
    const noMovement = a.deposit === null && a.withdrawal === null;
    if (noMovement && index === 0 && /^(b\/f|brought forward|opening balance)/i.test(narration)) {
      opening = a.balance;
      continue;
    }
    if ((a.deposit === null) === (a.withdrawal === null)) {
      warnings.push(`Could not tell whether the ${a.date} transaction is a deposit or a withdrawal.`);
      continue;
    }
    const direction = a.deposit !== null ? "credit" : "debit";
    const amountPaise = (a.deposit ?? a.withdrawal) as number;
    const upi = parseUpiNarration(narration);
    const partial = {
      txnDate: a.date,
      valueDate: null,
      direction,
      amountPaise,
      balancePaise: a.balance,
      narration,
      ...upi,
    } satisfies Omit<ParsedTransaction, "dedupeKey">;
    rows.push({ ...partial, dedupeKey: buildDedupeKey(partial) });
    checked.push({ date: a.date, deposit: a.deposit ?? 0, withdrawal: a.withdrawal ?? 0, balance: a.balance });
  }

  // Checks: every balance follows from the previous one, and the totals match the bank's TOTAL row.
  let running = opening;
  checked.forEach((t, i) => {
    if (running !== null && t.balance !== null && running + t.deposit - t.withdrawal !== t.balance) {
      warnings.push(`The balance after transaction ${i + 1} (${t.date}) does not add up.`);
    }
    if (t.balance !== null) running = t.balance;
  });
  const sum = (f: (t: (typeof checked)[number]) => number) => checked.reduce((s, t) => s + f(t), 0);
  if (printed) {
    if (sum((t) => t.deposit) !== printed.depositsPaise) warnings.push("The deposits do not match the total printed on the statement.");
    if (sum((t) => t.withdrawal) !== printed.withdrawalsPaise) warnings.push("The withdrawals do not match the total printed on the statement.");
    if (running !== null && running !== printed.balancePaise) warnings.push("The closing balance does not match the statement.");
  } else {
    warnings.push("The statement's TOTAL row was not found, so the totals could not be checked.");
  }

  return { rows, openingBalancePaise: opening, closingBalancePaise: running, printed, warnings };
}
