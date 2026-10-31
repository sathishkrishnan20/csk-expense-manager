// Duplicating existing transactions with new dates. A copy is a new hand entry: the category and the
// readable fields are copied, the bank-only fields (balance, narration, UPI details, bank key) are not.

import { UNRESOLVED } from "./classificationOutcome";
import { MAIN_GROUP_ID } from "./groups";
import { FALLBACK } from "./masterData";
import { PENDING_AI, type Direction } from "./taxonomy";

export interface DuplicateSource {
  id: string;
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string | null;
  paymentMethod: string | null;
  description: string | null;
  classifiedBy: string;
}

export type DateRule =
  | { mode: "date"; date: string } // every copy gets this one date
  | { mode: "shift"; months: number }; // each copy keeps its own day, moved by N months

// Shape of db/transactions.ts TransactionInput, so a draft can be saved as it is.
export interface DuplicateDraft {
  sourceId: string;
  label: string;
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string;
  paymentMethod: string | null;
  description: string | null;
  categoriseLater: boolean;
  groupId: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate();

// 2026-01-31 + 1 month = 2026-02-28: the day is kept where it exists, otherwise the month's last day.
export function shiftMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month1 = (index % 12 + 12) % 12 + 1;
  return `${year}-${pad(month1)}-${pad(Math.min(d, daysInMonth(year, month1)))}`;
}

// A copy of a row the AI never placed (or one still waiting) is left for Re-classify instead of
// copying a placeholder category.
function needsAi(row: DuplicateSource): boolean {
  return (
    row.classifiedBy === PENDING_AI ||
    row.classifiedBy === UNRESOLVED ||
    (row.category === FALLBACK.category && row.subcategory === FALLBACK.subcategory)
  );
}

export function buildDuplicates(rows: readonly DuplicateSource[], rule: DateRule, targetGroupId: string): DuplicateDraft[] {
  return rows.map((row) => {
    const later = needsAi(row);
    return {
      sourceId: row.id,
      label: row.payee || row.description || `${row.category} : ${row.subcategory}`,
      txnDate: rule.mode === "date" ? rule.date : shiftMonths(row.txnDate, rule.months),
      direction: row.direction,
      amountPaise: row.amountPaise,
      category: later ? "" : row.category,
      subcategory: later ? "" : row.subcategory,
      payee: row.payee ?? "",
      paymentMethod: row.paymentMethod,
      description: row.description,
      categoriseLater: later,
      groupId: targetGroupId,
    };
  });
}

// Hand entries are never matched against a bank statement, so a future-dated copy in Main is counted twice
// once the real statement is imported. A note, not a block.
export function futureDateWarning(drafts: readonly { txnDate: string }[], targetGroupId: string, today: string): string | null {
  if (targetGroupId !== MAIN_GROUP_ID) return null;
  if (!drafts.some((d) => d.txnDate > today)) return null;
  return "Some copies are dated in the future. If you import your bank statement later, the real rows will be added as well, so they would be counted twice. Consider duplicating into a group instead.";
}
