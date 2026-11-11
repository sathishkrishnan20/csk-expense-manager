// The database questions the Ask AI expense tools can run. The AI never writes SQL: it fills in the fields of an ExpenseFilter, the app
// validates them, and the statements below are built from a fixed set of pieces with every value passed as a parameter. Kept free of the
// database itself so the statements can be tested against a real SQLite in Node (tests/domain/chatQuery.test.ts).

export type ExpenseType = "spent" | "received" | "both";
export type ExpenseGroupBy = "none" | "category" | "subcategory" | "month" | "payee" | "payment_method" | "description";
export type EntrySort = "newest" | "largest";

export interface ExpenseFilter {
  type: ExpenseType;
  from: string; // yyyy-mm-dd
  to: string;
  category?: string;
  subcategory?: string;
  payee?: string; // part of the name
  textContains?: string[]; // any of these words in the description, the UPI note or the payee
}

export interface SqlFragment {
  sql: string;
  params: string[];
}

export interface Query {
  sql: string;
  params: (string | number)[];
}

// "%word%" for LIKE, with the characters LIKE treats as wildcards escaped (the statements say ESCAPE '\').
export const likePattern = (word: string): string => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const DIRECTION: Record<ExpenseType, string> = {
  spent: "AND direction = 'debit'",
  received: "AND direction = 'credit'",
  both: "",
};

// The conditions of a filter, to go after `status = 'ACTIVE' <group scope>`.
export function expenseWhere(f: ExpenseFilter): SqlFragment {
  const parts: string[] = [DIRECTION[f.type], "AND txn_date BETWEEN ? AND ?"];
  const params: string[] = [f.from, f.to];
  if (f.category) {
    parts.push("AND LOWER(TRIM(category)) = LOWER(?)");
    params.push(f.category.trim());
  }
  if (f.subcategory) {
    parts.push("AND LOWER(TRIM(subcategory)) = LOWER(?)");
    params.push(f.subcategory.trim());
  }
  if (f.payee) {
    parts.push("AND payee LIKE ? ESCAPE '\\'");
    params.push(likePattern(f.payee.trim()));
  }
  const words = (f.textContains ?? []).map((w) => w.trim()).filter(Boolean);
  if (words.length > 0) {
    parts.push(`AND (${words.map(() => "(description LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR payee LIKE ? ESCAPE '\\')").join(" OR ")})`);
    for (const w of words) params.push(likePattern(w), likePattern(w), likePattern(w));
  }
  return { sql: parts.filter(Boolean).join(" "), params };
}

const NOT_SET = (column: string) => `COALESCE(NULLIF(TRIM(${column}), ''), 'Not set')`;

export const GROUP_EXPRESSIONS: Record<Exclude<ExpenseGroupBy, "none">, string> = {
  category: NOT_SET("category"),
  subcategory: `${NOT_SET("category")} || ' : ' || ${NOT_SET("subcategory")}`,
  month: "substr(txn_date, 1, 7)",
  payee: NOT_SET("payee"),
  payment_method: NOT_SET("payment_method"),
  // what the account holder wrote: the description, else the UPI note, else the payee (an entry typed by hand keeps its text there)
  description: "LOWER(COALESCE(NULLIF(TRIM(description), ''), NULLIF(TRIM(note), ''), NULLIF(TRIM(payee), ''), '(no text)'))",
};

// The sum and count of the matching entries, in one row (groupBy "none"), or one row per group, largest first (a month list is in date
// order). One row more than `limit` is asked for, to know whether there are more.
export function buildTotalsQuery(scope: SqlFragment, f: ExpenseFilter, groupBy: ExpenseGroupBy, limit: number): Query {
  const where = expenseWhere(f);
  const base = `FROM transactions WHERE status = 'ACTIVE' ${scope.sql} ${where.sql}`;
  const params = [...scope.params, ...where.params];
  if (groupBy === "none") return { sql: `SELECT COALESCE(SUM(amount_paise), 0) AS total, COUNT(*) AS n ${base}`, params };
  return {
    sql: `SELECT ${GROUP_EXPRESSIONS[groupBy]} AS label, SUM(amount_paise) AS total, COUNT(*) AS n ${base}
          GROUP BY label ORDER BY ${groupBy === "month" ? "label ASC" : "total DESC"} LIMIT ?`,
    params: [...params, limit + 1],
  };
}

const SORT: Record<EntrySort, string> = {
  newest: "txn_date DESC, created_at DESC, rowid DESC",
  largest: "amount_paise DESC, txn_date DESC, rowid DESC",
};

// The matching entries (never the bank narration, UPI id or balance), at most `limit`.
export function buildEntriesQuery(scope: SqlFragment, f: ExpenseFilter, sort: EntrySort, limit: number): Query {
  const where = expenseWhere(f);
  return {
    sql: `SELECT txn_date, direction, amount_paise, category, subcategory, payee, payment_method, description, note, group_id
          FROM transactions WHERE status = 'ACTIVE' ${scope.sql} ${where.sql} ORDER BY ${SORT[sort]} LIMIT ?`,
    params: [...scope.params, ...where.params, limit],
  };
}

// How many entries match, for "showing 20 of 140".
export function buildMatchCountQuery(scope: SqlFragment, f: ExpenseFilter): Query {
  const where = expenseWhere(f);
  return { sql: `SELECT COUNT(*) AS n FROM transactions WHERE status = 'ACTIVE' ${scope.sql} ${where.sql}`, params: [...scope.params, ...where.params] };
}

// What the data layer gives the tools.
export interface TotalsResult {
  totalPaise: number;
  count: number;
  rows: { label: string; totalPaise: number; count: number }[];
  moreRows: boolean;
}

export interface EntryResult {
  date: string;
  direction: "debit" | "credit";
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string | null;
  paymentMethod: string | null;
  description: string | null;
  note: string | null;
  groupId: string;
}

export interface EntriesResult {
  matching: number;
  entries: EntryResult[];
}
