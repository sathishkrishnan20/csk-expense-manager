import type { ParsedTransaction } from "../domain/statementParser";
import { inferPaymentMethod, parseStatement, type ParseResult } from "../domain/statementParser";
import { FALLBACK } from "../domain/masterData";
import type { Classification, Direction } from "../domain/taxonomy";

export interface ImportedTransaction extends ParsedTransaction, Classification {
  classifiedBy: string;
  paymentMethod: string | null;
  description: string | null;
}

export interface TransactionStore {
  existingKeys(keys: string[]): Promise<Set<string>>; // includes deleted rows
  deletedKeys?(keys: string[]): Promise<Set<string>>; // the subset the owner deleted
  // Entries the app added by itself from a bank SMS (they have a payee and amount but no narration, UPI note or balance), among these keys.
  smsKeys?(keys: string[]): Promise<Set<string>>;
  // Fills in what the statement knows about such entries (payee, UPI note, balance); it does not touch a category. Returns how many were
  // updated, and those of them whose category the AI chose (not the owner), which are worth categorising again now that the note is known.
  enrich?(rows: ParsedTransaction[]): Promise<{ updated: number; aiLabelled: ParsedTransaction[] }>;
  // Sets the category the AI now gives such entries, unless the owner has chosen one meanwhile. Returns how many changed.
  recategorise?(items: { dedupeKey: string; classification: Classification }[], label: string): Promise<number>;
  insert(rows: ImportedTransaction[]): Promise<void>;
}

export interface ImportDeps {
  store: TransactionStore;
  classify: (rows: ParsedTransaction[], direction: Direction) => Promise<Map<number, Classification>>;
  classifierLabel: string;
  batchSize?: number;
  onProgress?: (message: string) => void;
}

export interface ImportSummary {
  parsed: number;
  skippedLines: number;
  duplicatesInFile: number;
  alreadyStored: number; // already in the app and still there
  enriched: number; // of those, entries that came from a bank SMS and got their payee, note and balance from this statement
  recategorised: number; // of those, entries the AI then put in a better category, now that it can see the UPI note
  // Rows of this file the owner deleted earlier. They are not added again unless the owner
  // asks (see restoreDeleted), so a deliberate delete survives importing an overlapping statement.
  deletedEarlier: ParsedTransaction[];
  imported: number;
  notSaved: number;
  error: string | null;
}

const DEFAULT_BATCH_SIZE = 20;

// The SMS gave the AI only a cut-short payee; the statement row has the UPI note and the full narration. The entries whose category the AI
// chose are put to it again with that, and only a real category replaces what they have (an answer of "Others : Uncategorised" changes
// nothing). A failure here (no internet, a quota) is not the import's failure: the entries keep the category they have.
async function recategorise(rows: ParsedTransaction[], deps: ImportDeps): Promise<number> {
  if (rows.length === 0 || !deps.store.recategorise) return 0;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  let changed = 0;
  try {
    for (const direction of ["debit", "credit"] as const) {
      const ofDirection = rows.filter((r) => r.direction === direction);
      for (let start = 0; start < ofDirection.length; start += batchSize) {
        const batch = ofDirection.slice(start, start + batchSize);
        deps.onProgress?.(`Categorising ${batch.length} payment${batch.length === 1 ? "" : "s"} again with the statement's details…`);
        const answers = await deps.classify(batch, direction);
        const better = batch.flatMap((row, i) => {
          const c = answers.get(i);
          return c && !(c.category === FALLBACK.category && c.subcategory === FALLBACK.subcategory)
            ? [{ dedupeKey: row.dedupeKey, classification: { category: c.category, subcategory: c.subcategory } }]
            : [];
        });
        if (better.length > 0) changed += await deps.store.recategorise(better, deps.classifierLabel);
      }
    }
  } catch {
    // keep the categories they have
  }
  return changed;
}

// Text of a CSV (or a spreadsheet saved as CSV) from the bank.
export async function importStatement(text: string, deps: ImportDeps): Promise<ImportSummary> {
  return importParsed(parseStatement(text), deps);
}

// Rows already read from any source (CSV, spreadsheet, PDF): drops the ones already stored, categorises
// the rest and saves them.
export async function importParsed({ rows, skippedLines }: ParseResult, deps: ImportDeps): Promise<ImportSummary> {
  const unique = new Map<string, ParsedTransaction>();
  for (const row of rows) if (!unique.has(row.dedupeKey)) unique.set(row.dedupeKey, row);

  // Keys of soft-deleted rows are still in the store, so a transaction the user
  // deleted is not brought back by importing the same statement again; it is reported instead.
  const keys = [...unique.keys()];
  const existing = await deps.store.existingKeys(keys);
  const deleted = existing.size > 0 && deps.store.deletedKeys ? await deps.store.deletedKeys(keys) : new Set<string>();
  const fresh = [...unique.values()].filter((r) => !existing.has(r.dedupeKey));
  const deletedEarlier = [...unique.values()].filter((r) => deleted.has(r.dedupeKey));

  // An entry added from a bank SMS has less than the statement row (a cut-short payee, no UPI note, no balance): the statement fills it in.
  let enriched = 0;
  let recategorised = 0;
  if (existing.size > 0 && deps.store.smsKeys && deps.store.enrich) {
    const fromSms = await deps.store.smsKeys([...existing]);
    const toEnrich = [...unique.values()].filter((r) => fromSms.has(r.dedupeKey) && !deleted.has(r.dedupeKey));
    if (toEnrich.length > 0) {
      const done = await deps.store.enrich(toEnrich);
      enriched = done.updated;
      recategorised = await recategorise(done.aiLabelled, deps);
    }
  }

  const summary: ImportSummary = {
    parsed: rows.length,
    skippedLines,
    duplicatesInFile: rows.length - unique.size,
    alreadyStored: unique.size - fresh.length - deletedEarlier.length,
    enriched,
    recategorised,
    deletedEarlier,
    imported: 0,
    notSaved: 0,
    error: null,
  };

  const groups: { direction: Direction; rows: ParsedTransaction[] }[] = [
    { direction: "debit", rows: fresh.filter((r) => r.direction === "debit") },
    { direction: "credit", rows: fresh.filter((r) => r.direction === "credit") },
  ];
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  let done = 0;

  for (let g = 0; g < groups.length; g++) {
    const { direction, rows: groupRows } = groups[g];

    for (let start = 0; start < groupRows.length; start += batchSize) {
      const batch = groupRows.slice(start, start + batchSize);
      deps.onProgress?.(`Classifying ${Math.min(done + batch.length, total)} of ${total}…`);

      let classified: Map<number, Classification>;
      try {
        classified = await deps.classify(batch, direction);
      } catch (err) {
        // Stop at the first failed batch: later ones would very likely fail the
        // same way (bad key, quota). Rows saved so far are skipped on re-upload,
        // so uploading again resumes where this stopped.
        summary.error = err instanceof Error ? err.message : String(err);
        const laterGroups = groups.slice(g + 1).reduce((n, later) => n + later.rows.length, 0);
        summary.notSaved += groupRows.length - start + laterGroups;
        return summary;
      }

      const toSave: ImportedTransaction[] = [];
      batch.forEach((row, index) => {
        const result = classified.get(index);
        if (result) {
          toSave.push({
            ...row,
            ...result,
            classifiedBy: deps.classifierLabel,
            paymentMethod: row.upiRef ? "UPI" : inferPaymentMethod(row.narration),
            description: row.note,
          });
        } else {
          summary.notSaved++;
        }
      });
      if (toSave.length > 0) await deps.store.insert(toSave);
      summary.imported += toSave.length;
      done += batch.length;
    }
  }

  return summary;
}
