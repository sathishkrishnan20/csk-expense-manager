import type { SQLiteDatabase } from "expo-sqlite";
import type { ImportedTransaction, TransactionStore } from "../import/importStatement";
import { inferPaymentMethod } from "../domain/statementParser";
import { scopeStore, type KeyedStore } from "../import/scopedStore";
import type { ReclassifyCandidate } from "../import/reclassify";
import type { Classification, Direction } from "../domain/taxonomy";
import { FALLBACK, type Suggestion } from "../domain/masterData";
import { RECATEGORISE_ATTEMPTS_USED, UNRESOLVED, aiAttemptOutcome } from "../domain/classificationOutcome";
import { PENDING_AI, fallbackFor } from "../domain/taxonomy";
import { addSuggestions, addUnsuggested } from "../import/suggestionStore";
import type { GroupScope } from "../domain/groupScope";
import { getDb, inTransaction } from "./database";
import { insertGroup, type GroupInput } from "./groups";
import type { OpeningIncome } from "../domain/entryGroup";

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
  groupId: string;
  createdGroupId: string | null; // the group this entry was used to create
}

export interface TransactionInput {
  createdGroupId?: string | null;
  groupId: string; // which group a new row goes into; an edit never moves a row
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
  // With categoriseLater, on an edit: the owner chose "Recategorise with AI", so the AI gets one more attempt only.
  recategorise?: boolean;
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
  group_id: string;
  created_group_id: string | null;
}

const COLUMNS =
  "id, txn_date, direction, amount_paise, balance_paise, category, subcategory, payee, payment_method, description, source, classified_by, group_id, created_group_id";

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
    groupId: r.group_id,
    createdGroupId: r.created_group_id,
  };
}

// One group's transactions, newest first. Soft-deleted rows are never listed or counted.
// "AND group_id IN (...)" for one group, several groups, or nothing for every group (null).
function scopeSql(scope: string | GroupScope): { sql: string; params: string[] } {
  if (scope === null) return { sql: "", params: [] };
  const ids = typeof scope === "string" ? [scope] : scope;
  if (ids.length === 0) return { sql: "AND 0", params: [] };
  return { sql: `AND group_id IN (${ids.map(() => "?").join(",")})`, params: [...ids] };
}

// One group's, several groups' or every group's transactions (the group filter), newest first.
export async function listTransactions(scope: string | GroupScope, limit?: number): Promise<TransactionRecord[]> {
  const db = await getDb();
  const where = scopeSql(scope);
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM transactions WHERE status = 'ACTIVE' ${where.sql}
     ORDER BY txn_date DESC, created_at DESC, rowid DESC ${limit ? "LIMIT ?" : ""}`,
    limit ? [...where.params, limit] : where.params,
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

async function insertManual(db: SQLiteDatabase, input: TransactionInput): Promise<void> {
  const stored = categoryFor(input);
  await db.runAsync(
    `INSERT INTO transactions
       (id, source, group_id, created_group_id, txn_date, direction, amount_paise, category, subcategory, payee, payment_method, description, classified_by)
     VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      input.groupId,
      input.createdGroupId ?? null,
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

export async function addTransaction(input: TransactionInput): Promise<void> {
  await insertManual(await getDb(), input);
}

// A hand entry that may also create a group: the group (with its optional opening income) and the entry go in together,
// and the entry remembers the group it created.
export interface NewEntry {
  input: TransactionInput;
  group?: GroupInput & { opening: OpeningIncome | null };
}

// Several hand entries at once, all or none (used by Add and Duplicate).
export async function addEntries(entries: NewEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDb();
  await inTransaction(db, async (txn) => {
    for (const { input, group } of entries) {
      let createdGroupId: string | null = null;
      if (group) {
        createdGroupId = await insertGroup(txn, group);
        if (group.opening) await insertManual(txn, { ...group.opening, groupId: createdGroupId, categoriseLater: false });
      }
      await insertManual(txn, { ...input, createdGroupId });
    }
  });
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
       ai_attempts = CASE WHEN ? THEN ? ELSE ai_attempts END,
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
      stored.pending && input.recategorise ? 1 : 0,
      RECATEGORISE_ATTEMPTS_USED,
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

export async function getTotals(scope: string | GroupScope, range?: DateRange): Promise<Totals> {
  const db = await getDb();
  const where = scopeSql(scope);
  const rows = await db.getAllAsync<{ direction: Direction; total: number }>(
    `SELECT direction, SUM(amount_paise) AS total FROM transactions
     WHERE status = 'ACTIVE' ${where.sql} ${range ? "AND txn_date BETWEEN ? AND ?" : ""}
     GROUP BY direction`,
    range ? [...where.params, range.start, range.end] : where.params,
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

export async function getExpensesBy(scope: string | GroupScope, grouping: ExpenseGrouping, range: DateRange): Promise<GroupTotal[]> {
  const column = GROUP_COLUMNS[grouping];
  const db = await getDb();
  const where = scopeSql(scope);
  const rows = await db.getAllAsync<{ label: string; total: number }>(
    `SELECT COALESCE(NULLIF(TRIM(${column}), ''), 'Not set') AS label, SUM(amount_paise) AS total
     FROM transactions
     WHERE status = 'ACTIVE' ${where.sql} AND direction = 'debit' AND txn_date BETWEEN ? AND ?
     GROUP BY label ORDER BY total DESC`,
    [...where.params, range.start, range.end],
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

// Bank rows from a statement. existingKeys includes soft-deleted rows on purpose. The keys it sees are
// already scoped to the group (see scopeStore), and the scoped key is also the row's id.
const keyedSqliteStore: KeyedStore = {
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

  // Entries added from a bank SMS: from an import, with a UPI reference, but none of what a statement row always has (narration, balance).
  async smsKeys(keys) {
    const db = await getDb();
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += KEY_CHUNK) {
      const chunk = keys.slice(i, i + KEY_CHUNK);
      const rows = await db.getAllAsync<{ dedupe_key: string }>(
        `SELECT dedupe_key FROM transactions
         WHERE status = 'ACTIVE' AND source = 'import' AND balance_paise IS NULL AND COALESCE(narration, '') = ''
           AND upi_ref IS NOT NULL AND dedupe_key IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
      for (const row of rows) found.add(row.dedupe_key);
    }
    return found;
  },

  // The statement's details for those entries. The category is not touched here. The payee is replaced only when the SMS's (usually
  // cut short) is the start of the statement's, so a payee the owner typed over stays; the description is filled only when empty.
  // Also says which of them the AI categorised (not the owner), so the importer can categorise those again with the new details.
  async enrich(rows) {
    const db = await getDb();
    let updated = 0;
    const aiLabelled: typeof rows = [];
    await inTransaction(db, async (txn) => {
      for (const r of rows) {
        const before = await txn.getFirstAsync<{ classified_by: string }>(
          "SELECT classified_by FROM transactions WHERE dedupe_key = ? AND status = 'ACTIVE'",
          [r.dedupeKey],
        );
        const result = await txn.runAsync(
          `UPDATE transactions SET
             balance_paise = ?, narration = ?, vpa = ?, note = ?, payee_bank = ?,
             payee = CASE WHEN payee IS NULL OR payee = '' OR instr(lower(?), lower(payee)) = 1 THEN COALESCE(?, payee) ELSE payee END,
             payment_method = COALESCE(payment_method, ?),
             description = CASE WHEN description IS NULL OR description = '' THEN ? ELSE description END,
             updated_at = datetime('now')
           WHERE dedupe_key = ? AND status = 'ACTIVE'`,
          [r.balancePaise, r.narration, r.vpa, r.note, r.payeeBank, r.payee ?? "", r.payee, inferPaymentMethod(r.narration), r.note, r.dedupeKey],
        );
        updated += result.changes;
        if (result.changes > 0 && before && before.classified_by !== "manual") aiLabelled.push(r);
      }
    });
    return { updated, aiLabelled };
  },

  // The category the AI gives an entry now that it knows the UPI note. An entry the owner categorised in the meantime is left alone.
  async recategorise(items, label) {
    const db = await getDb();
    let changed = 0;
    await inTransaction(db, async (txn) => {
      for (const { dedupeKey, classification } of items) {
        const result = await txn.runAsync(
          `UPDATE transactions SET category = ?, subcategory = ?, classified_by = ?, updated_at = datetime('now')
           WHERE dedupe_key = ? AND status = 'ACTIVE' AND classified_by != 'manual'`,
          [classification.category, classification.subcategory, label, dedupeKey],
        );
        changed += result.changes;
      }
    });
    return changed;
  },

  async insert(rows: ImportedTransaction[], groupId: string) {
    const db = await getDb();
    const saved: { id: string; suggestion: Suggestion | undefined }[] = [];
    await inTransaction(db, async (txn) => {
      for (const r of rows) {
        // The import is the AI's first attempt at this transaction.
        const outcome = aiAttemptOutcome(0, couldNotPlace(r));
        const inserted = await txn.runAsync(
          `INSERT OR IGNORE INTO transactions
             (id, dedupe_key, group_id, source, txn_date, direction, amount_paise, balance_paise, category, subcategory,
              payee, payment_method, description, narration, vpa, note, payee_bank, upi_ref, classified_by, ai_attempts)
           VALUES (?, ?, ?, 'import', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.dedupeKey,
            r.dedupeKey,
            groupId,
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
            outcome.unresolved ? UNRESOLVED : r.classifiedBy,
            outcome.attempts,
          ],
        );
        if (inserted.changes > 0) saved.push({ id: r.dedupeKey, suggestion: r.suggestion });
      }
    });
    // Where the AI thinks the rows it could not place belong, for the suggestions screen (memory only).
    addSuggestions(saved);
  },
};

// The importer's store for one group: every row of the file goes into that group.
export const createSqliteStore = (groupId: string): TransactionStore => scopeStore(keyedSqliteStore, groupId);

// The AI answered with the fallback (a debit or a credit); counts as one failed attempt.
const couldNotPlace = (c: Classification): boolean => c.category === FALLBACK.category && c.subcategory === FALLBACK.subcategory;

const CANDIDATE_WHERE = `status = 'ACTIVE' AND classified_by NOT IN ('manual', '${UNRESOLVED}')
  AND (classified_by IN ('${PENDING_AI}', 'migrated') OR (category = ? AND subcategory = ?))`;

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
  const updated: { id: string; suggestion: Suggestion | undefined }[] = [];
  const noIdea: string[] = [];
  await inTransaction(db, async (txn) => {
    for (const { id, classification } of updates) {
      const row = await txn.getFirstAsync<{ ai_attempts: number }>(
        "SELECT ai_attempts FROM transactions WHERE id = ? AND classified_by != 'manual'",
        [id],
      );
      if (!row) continue;
      // Each failed answer is an attempt; after MAX_AI_ATTEMPTS the AI stops being asked and the
      // owner is shown the transaction in the "Couldn't categorise" list.
      const outcome = aiAttemptOutcome(row.ai_attempts, couldNotPlace(classification));
      await txn.runAsync(
        `UPDATE transactions SET category = ?, subcategory = ?, classified_by = ?, ai_attempts = ?,
           updated_at = datetime('now')
         WHERE id = ? AND classified_by != 'manual'`,
        [classification.category, classification.subcategory, outcome.unresolved ? UNRESOLVED : label, outcome.attempts, id],
      );
      updated.push({ id, suggestion: classification.suggestion });
      if (couldNotPlace(classification) && !classification.suggestion) noIdea.push(id);
    }
  });
  // Where the AI thinks the entries it could not place belong, and the ones it had no idea for, for the suggestions screen (memory only).
  addSuggestions(updated);
  addUnsuggested(noIdea);
}

// How many transactions the AI gave up on and that wait for the owner; null counts every group.
export async function countUnresolved(groupId: string | null): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions WHERE status = 'ACTIVE' AND classified_by = ? ${groupId ? "AND group_id = ?" : ""}`,
    groupId ? [UNRESOLVED, groupId] : [UNRESOLVED],
  );
  return row?.n ?? 0;
}

// Gives the AI another go at them: they count as waiting again, with fresh attempts.
export async function retryUnresolved(): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync(
    `UPDATE transactions SET classified_by = ?, ai_attempts = 0, updated_at = datetime('now')
     WHERE status = 'ACTIVE' AND classified_by = ?`,
    [PENDING_AI, UNRESOLVED],
  );
  return r.changes;
}
