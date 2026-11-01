import type { Suggestion } from "../domain/masterData";
import { FALLBACK } from "../domain/masterData";
import { snapToExisting, tidyName, validateSuggestion } from "../domain/suggestions";
import type { Direction } from "../domain/taxonomy";
import { pendingSuggestions, pendingUnsuggested, removeSuggestions, removeUnsuggested } from "../import/suggestionStore";
import { getDb, inTransaction } from "./database";

export interface UnsuggestedEntry {
  id: string;
  txnDate: string;
  direction: Direction;
  amountPaise: number;
  payee: string | null;
  description: string | null;
}

export interface SuggestionEntry extends UnsuggestedEntry {
  suggestion: Suggestion;
}

const CHUNK = 200;
const chunksOf = <T>(items: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
};

// The entries that still wait for an answer, newest first, in every group (the category list is shared by all groups). The
// suggestions come from memory (import/suggestionStore.ts); an entry that has been categorised since, or deleted, is
// dropped from it here.
export async function listSuggestions(): Promise<SuggestionEntry[]> {
  const waiting = pendingSuggestions();
  if (waiting.length === 0) return [];
  const suggestionOf = new Map(waiting.map((w) => [w.id, w.suggestion]));
  const found = await stillUncategorised(waiting.map((w) => w.id));
  const stillWaiting = new Set(found.map((e) => e.id));
  removeSuggestions(waiting.map((w) => w.id).filter((id) => !stillWaiting.has(id)));
  return found.map((e) => ({ ...e, suggestion: suggestionOf.get(e.id)! }));
}

// The entries the AI could not place and had no suggestion for, newest first. Same rules as listSuggestions: one that has been
// categorised since, or deleted, is dropped.
export async function listUnsuggested(): Promise<UnsuggestedEntry[]> {
  const waiting = pendingUnsuggested();
  if (waiting.length === 0) return [];
  const found = await stillUncategorised(waiting);
  const stillWaiting = new Set(found.map((e) => e.id));
  removeUnsuggested(waiting.filter((id) => !stillWaiting.has(id)));
  return found;
}

// Of these entries, the ones still active and still in Others : Uncategorised without a category chosen by hand, newest first.
async function stillUncategorised(ids: string[]): Promise<UnsuggestedEntry[]> {
  const db = await getDb();
  const found: UnsuggestedEntry[] = [];
  for (const chunk of chunksOf(ids)) {
    const rows = await db.getAllAsync<{
      id: string;
      txn_date: string;
      direction: Direction;
      amount_paise: number;
      payee: string | null;
      description: string | null;
    }>(
      `SELECT id, txn_date, direction, amount_paise, payee, description FROM transactions
       WHERE status = 'ACTIVE' AND classified_by != 'manual' AND category = ? AND subcategory = ?
         AND id IN (${chunk.map(() => "?").join(",")})`,
      [FALLBACK.category, FALLBACK.subcategory, ...chunk],
    );
    for (const r of rows) {
      found.push({
        id: r.id,
        txnDate: r.txn_date,
        direction: r.direction,
        amountPaise: r.amount_paise,
        payee: r.payee,
        description: r.description,
      });
    }
  }
  return found.sort((a, b) => (a.txnDate < b.txnDate ? 1 : a.txnDate > b.txnDate ? -1 : 0));
}

// Approves: adds the category and subcategory to the master list when they are not there yet, and puts the entries in
// them as the owner's own choice (the AI never overwrites it). `category` and `subcategory` are what the owner approved,
// possibly edited; a credit always goes under Income. All entries must be the same direction.
export async function approveSuggestions(ids: string[], category: string, subcategory: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await inTransaction(db, async (txn) => {
    const found = await txn.getAllAsync<{ direction: Direction }>(
      `SELECT DISTINCT direction FROM transactions WHERE status = 'ACTIVE' AND id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    if (found.length === 0) return;
    if (found.length > 1) throw new Error("Expenses and credits cannot be approved together.");
    const direction = found[0].direction;

    const problem = validateSuggestion(direction, category, subcategory);
    if (problem) throw new Error(problem);

    const master = new Map<string, string[]>();
    for (const r of await txn.getAllAsync<{ category: string; subcategory: string }>(
      "SELECT category, subcategory FROM categories ORDER BY sort, id",
    )) {
      master.set(r.category, [...(master.get(r.category) ?? []), r.subcategory]);
    }
    const chosen = snapToExisting([...master].map(([c, subs]) => ({ category: c, subcategories: subs })), category, subcategory);

    if (!(master.get(chosen.category) ?? []).some((s) => s === chosen.subcategory)) {
      const max = await txn.getFirstAsync<{ m: number }>("SELECT COALESCE(MAX(sort), 0) AS m FROM categories");
      await txn.runAsync("INSERT INTO categories (category, subcategory, sort) VALUES (?, ?, ?)", [
        chosen.category,
        tidyName(chosen.subcategory),
        (max?.m ?? 0) + 1,
      ]);
    }

    for (const chunk of chunksOf(ids)) {
      await txn.runAsync(
        `UPDATE transactions SET category = ?, subcategory = ?, classified_by = 'manual', updated_at = datetime('now')
         WHERE status = 'ACTIVE' AND id IN (${chunk.map(() => "?").join(",")})`,
        [chosen.category, chosen.subcategory, ...chunk],
      );
    }
  });
  removeSuggestions(ids);
}
