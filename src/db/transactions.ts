import type { ImportedTransaction, TransactionStore } from "../import/importStatement";
import type { ReclassifyCandidate } from "../import/reclassify";
import type { Classification, Direction } from "../domain/taxonomy";
import { FALLBACK } from "../domain/masterData";
import { PENDING_AI, fallbackFor } from "../domain/taxonomy";
import { getDb, inTransaction } from "./database";

export interface TransactionRecord {
  id: string;
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  balancePaise: number | null;
  category: string;
  subcategory: string;
  payee: string | null;
  paymentMethod: string | null;
  description: string | null;
  source: "import" | "manual";
  classifiedBy: string;
}

export interface TransactionInput {
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  category: string;
  subcategory: string;
  payee: string;
  paymentMethod: string | null;
  description: string | null;
  // Leave the category to the AI: the row is stored in the fallback category and marked
  // pending, and "Re-classify Uncategorised" labels it later (category/subcategory are ignored).
  categoriseLater?: boolean;
}

// What actually gets stored for the category columns and classified_by.
function categoryFor(input: TransactionInput) {
  if (input.categoriseLater) return { ...fallbackFor(input.direction), pending: true };
  return { category: input.category, subcategory: input.subcategory, pending: false };
}

interface Row {
  id: string;
  txn_date: string;
  direction: Direction;
  amount_paise: number;
  balance_paise: number | null;
  category: string;
  subcategory: string;
  payee: string | null;
  payment_method: string | null;
  description: string | null;
  source: "import" | "manual";
  classified_by: string;
}

const COLUMNS =
  "id, txn_date, direction, amount_paise, balance_paise, category, subcategory, payee, payment_method, description, source, classified_by";

function toRecord(r: Row): TransactionRecord {
  return {
    id: r.id,
    txnDate: r.txn_date,
    direction: r.direction,
    amountPaise: r.amount_paise,
    balancePaise: r.balance_paise,
    category: r.category,
    subcategory: r.subcategory,
    payee: r.payee,
    paymentMethod: r.payment_method,
    description: r.description,
    source: r.source,
    classifiedBy: r.classified_by,
  };
}

// Newest first. Soft-deleted rows are never listed or counted.
export async function listTransactions(limit?: number): Promise<TransactionRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM transactions WHERE status = 'ACTIVE'
     ORDER BY txn_date DESC, created_at DESC, rowid DESC ${limit ? "LIMIT ?" : ""}`,
    limit ? [limit] : [],
  );
  return rows.map(toRecord);
}

export async function getTransaction(id: string): Promise<TransactionRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>(`SELECT ${COLUMNS} FROM transactions WHERE id = ? AND status = 'ACTIVE'`, [id]);
  return row ? toRecord(row) : null;
}

function newId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function addTransaction(input: TransactionInput): Promise<void> {
  const db = await getDb();
  const stored = categoryFor(input);
  await db.runAsync(
    `INSERT INTO transactions
       (id, source, txn_date, direction, amount_paise, category, subcategory, payee, payment_method, description, classified_by)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.txnDate,
      input.direction,
      input.amountPaise,
      stored.category,
      stored.subcategory,
      input.payee,
      input.paymentMethod,
      input.description,
      stored.pending ? PENDING_AI : "manual",
    ],
  );
}

// Changing the category of an AI-labelled row marks it as the user's own choice,
// so "Re-classify uncategorised" will never overwrite it. Choosing "Categorise later"
// hands the row back to the AI; choosing a category on a waiting row makes it the owner's.
export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const db = await getDb();
  const stored = categoryFor(input);
  await db.runAsync(
    `UPDATE transactions SET
       txn_date = ?, direction = ?, amount_paise = ?,
       classified_by = CASE
         WHEN ? THEN ?
         WHEN classified_by = ? OR category != ? OR subcategory != ? THEN 'manual'
         ELSE classified_by END,
       category = ?, subcategory = ?, payee = ?, payment_method = ?, description = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.txnDate,
      input.direction,
      input.amountPaise,
      stored.pending ? 1 : 0,
      PENDING_AI,
      PENDING_AI,
      stored.category,
      stored.subcategory,
      stored.category,
      stored.subcategory,
      input.payee,
      input.paymentMethod,
      input.description,
      id,
    ],
  );
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE transactions SET status = 'DELETED', updated_at = datetime('now') WHERE id = ?", [id]);
}

export interface Totals {
  incomePaise: number;
  expensePaise: number;
}

export interface DateRange {
  start: string;
  end: string;
}

export async function getTotals(range?: DateRange): Promise<Totals> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ direction: Direction; total: number }>(
    `SELECT direction, SUM(amount_paise) AS total FROM transactions
     WHERE status = 'ACTIVE' ${range ? "AND txn_date BETWEEN ? AND ?" : ""}
     GROUP BY direction`,
    range ? [range.start, range.end] : [],
  );
  const sum = (d: Direction) => rows.find((r) => r.direction === d)?.total ?? 0;
  return { incomePaise: sum("credit"), expensePaise: sum("debit") };
}

export type ExpenseGrouping = "category" | "subcategory" | "payment_method" | "payee";

const GROUP_COLUMNS: Record<ExpenseGrouping, string> = {
  category: "category",
  subcategory: "subcategory",
  payment_method: "payment_method",
  payee: "payee",
};

export interface GroupTotal {
  label: string;
  totalPaise: number;
}

const MAX_GROUPS = 20;

export async function getExpensesBy(grouping: ExpenseGrouping, range: DateRange): Promise<GroupTotal[]> {
  const column = GROUP_COLUMNS[grouping];
  const db = await getDb();
  const rows = await db.getAllAsync<{ label: string; total: number }>(
    `SELECT COALESCE(NULLIF(TRIM(${column}), ''), 'Not set') AS label, SUM(amount_paise) AS total
     FROM transactions
     WHERE status = 'ACTIVE' AND direction = 'debit' AND txn_date BETWEEN ? AND ?
     GROUP BY label ORDER BY total DESC`,
    [range.start, range.end],
  );
  const groups = rows.map((r) => ({ label: r.label, totalPaise: r.total }));
  if (groups.length <= MAX_GROUPS) return groups;

  // A statement can have hundreds of distinct payees; keep the chart readable.
  const top = groups.slice(0, MAX_GROUPS - 1);
  const rest = groups.slice(MAX_GROUPS - 1).reduce((n, g) => n + g.totalPaise, 0);
  return [...top, { label: "Rest", totalPaise: rest }];
}

const KEY_CHUNK = 500;

// Puts deleted bank rows back after the owner confirmed it. Returns how many came back and which
// of them the AI may categorise again (not the ones whose category the owner chose by hand).
export async function restoreDeleted(dedupeKeys: string[]): Promise<{ restored: number; reclassifiable: Set<string> }> {
  const db = await getDb();
  let restored = 0;
  const reclassifiable = new Set<string>();
  await inTransaction(db, async (txn) => {
    for (let i = 0; i < dedupeKeys.length; i += KEY_CHUNK) {
      const chunk = dedupeKeys.slice(i, i + KEY_CHUNK);
      const r = await txn.runAsync(
        `UPDATE transactions SET status = 'ACTIVE', updated_at = datetime('now')
         WHERE status = 'DELETED' AND dedupe_key IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
      restored += r.changes;

      const rows = await txn.getAllAsync<{ dedupe_key: string }>(
        `SELECT dedupe_key FROM transactions
         WHERE status = 'ACTIVE' AND classified_by != 'manual' AND dedupe_key IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
      for (const row of rows) reclassifiable.add(row.dedupe_key);
    }
  });
  return { restored, reclassifiable };
}

// Bank rows from a statement. existingKeys includes soft-deleted rows on purpose.
export const sqliteStore: TransactionStore = {
  async existingKeys(keys) {
    const db = await getDb();
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += KEY_CHUNK) {
      const chunk = keys.slice(i, i + KEY_CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = await db.getAllAsync<{ dedupe_key: string }>(
        `SELECT dedupe_key FROM transactions WHERE dedupe_key IN (${placeholders})`,
        chunk,
      );
      for (const row of rows) found.add(row.dedupe_key);
    }
    return found;
  },

  async deletedKeys(keys) {
    const db = await getDb();
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += KEY_CHUNK) {
      const chunk = keys.slice(i, i + KEY_CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = await db.getAllAsync<{ dedupe_key: string }>(
        `SELECT dedupe_key FROM transactions WHERE status = 'DELETED' AND dedupe_key IN (${placeholders})`,
        chunk,
      );
      for (const row of rows) found.add(row.dedupe_key);
    }
    return found;
  },

  async insert(rows: ImportedTransaction[]) {
    const db = await getDb();
    await inTransaction(db, async (txn) => {
      for (const r of rows) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO transactions
             (id, dedupe_key, source, txn_date, direction, amount_paise, balance_paise, category, subcategory,
              payee, payment_method, description, narration, vpa, note, payee_bank, upi_ref, classified_by)
           VALUES (?, ?, 'import', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.dedupeKey,
            r.dedupeKey,
            r.txnDate,
            r.direction,
            r.amountPaise,
            r.balancePaise,
            r.category,
            r.subcategory,
            r.payee,
            r.paymentMethod,
            r.description,
            r.narration,
            r.vpa,
            r.note,
            r.payeeBank,
            r.upiRef,
            r.classifiedBy,
          ],
        );
      }
    });
  },
};


const CANDIDATE_WHERE = `status = 'ACTIVE' AND classified_by != 'manual'
  AND (classified_by IN ('${PENDING_AI}', 'migrated') OR (direction = 'debit' AND category = ? AND subcategory = ?))`;

// Rows the AI left in the fallback, rows that came from the earlier version of the app, and
// hand entries waiting for the AI ("Categorise later"); never rows the user categorised by hand.
export async function listReclassifyCandidates(): Promise<ReclassifyCandidate[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    direction: Direction;
    amount_paise: number;
    payee: string | null;
    vpa: string | null;
    note: string | null;
    description: string | null;
    narration: string | null;
  }>(
    `SELECT id, direction, amount_paise, payee, vpa, note, description, narration FROM transactions
     WHERE ${CANDIDATE_WHERE} ORDER BY txn_date DESC`,
    [FALLBACK.category, FALLBACK.subcategory],
  );
  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    amountPaise: r.amount_paise,
    payee: r.payee,
    vpa: r.vpa,
    note: r.note,
    description: r.description,
    narration: r.narration ?? "",
  }));
}

export async function countReclassifyCandidates(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions WHERE ${CANDIDATE_WHERE}`, [
    FALLBACK.category,
    FALLBACK.subcategory,
  ]);
  return row?.n ?? 0;
}

export async function applyClassifications(
  updates: { id: string; classification: Classification }[],
  label: string,
): Promise<void> {
  if (updates.length === 0) return;
  const db = await getDb();
  await inTransaction(db, async (txn) => {
    for (const { id, classification } of updates) {
      await txn.runAsync(
        `UPDATE transactions SET category = ?, subcategory = ?, classified_by = ?, updated_at = datetime('now')
         WHERE id = ? AND classified_by != 'manual'`,
        [classification.category, classification.subcategory, label, id],
      );
    }
  });
}
