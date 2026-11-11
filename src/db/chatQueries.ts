import {
  buildEntriesQuery,
  buildMatchCountQuery,
  buildTotalsQuery,
  type EntriesResult,
  type EntrySort,
  type ExpenseFilter,
  type ExpenseGroupBy,
  type TotalsResult,
} from "../domain/chatQuery";
import type { GroupScope } from "../domain/groupScope";
import { getDb } from "./database";
import { scopeSql } from "./transactions";

// Runs the statements of domain/chatQuery.ts on the phone's database, for the groups chosen on the Ask AI page. The SQL is built there, from
// parameters; nothing the AI wrote is ever put into a statement as text.

export async function queryExpenseTotals(scope: GroupScope, filter: ExpenseFilter, groupBy: ExpenseGroupBy, limit: number): Promise<TotalsResult> {
  const db = await getDb();
  const where = scopeSql(scope);
  const overall = buildTotalsQuery(where, filter, "none", limit);
  const total = await db.getFirstAsync<{ total: number; n: number }>(overall.sql, overall.params);
  const result: TotalsResult = { totalPaise: total?.total ?? 0, count: total?.n ?? 0, rows: [], moreRows: false };
  if (groupBy === "none") return result;

  const grouped = buildTotalsQuery(where, filter, groupBy, limit);
  const rows = await db.getAllAsync<{ label: string; total: number; n: number }>(grouped.sql, grouped.params);
  result.moreRows = rows.length > limit;
  result.rows = rows.slice(0, limit).map((r) => ({ label: r.label, totalPaise: r.total, count: r.n }));
  return result;
}

export async function queryExpenseEntries(scope: GroupScope, filter: ExpenseFilter, sort: EntrySort, limit: number): Promise<EntriesResult> {
  const db = await getDb();
  const where = scopeSql(scope);
  const entries = buildEntriesQuery(where, filter, sort, limit);
  const count = buildMatchCountQuery(where, filter);
  const [rows, total] = await Promise.all([
    db.getAllAsync<{
      txn_date: string;
      direction: "debit" | "credit";
      amount_paise: number;
      category: string;
      subcategory: string;
      payee: string | null;
      payment_method: string | null;
      description: string | null;
      note: string | null;
      group_id: string;
    }>(entries.sql, entries.params),
    db.getFirstAsync<{ n: number }>(count.sql, count.params),
  ]);
  return {
    matching: total?.n ?? rows.length,
    entries: rows.map((r) => ({
      date: r.txn_date,
      direction: r.direction,
      amountPaise: r.amount_paise,
      category: r.category,
      subcategory: r.subcategory,
      payee: r.payee,
      paymentMethod: r.payment_method,
      description: r.description,
      note: r.note,
      groupId: r.group_id,
    })),
  };
}
