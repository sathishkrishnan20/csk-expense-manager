import type { ParsedTransaction } from "../domain/statementParser";
import { inferPaymentMethod, parseStatement } from "../domain/statementParser";
import type { Classification, Direction } from "../domain/taxonomy";

export interface ImportedTransaction extends ParsedTransaction, Classification {
  classifiedBy: string;
  paymentMethod: string | null;
  description: string | null;
}

export interface TransactionStore {
  existingKeys(keys: string[]): Promise<Set<string>>;
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
  alreadyStored: number;
  imported: number;
  notSaved: number;
  error: string | null;
}

const DEFAULT_BATCH_SIZE = 20;

export async function importStatement(text: string, deps: ImportDeps): Promise<ImportSummary> {
  const { rows, skippedLines } = parseStatement(text);

  const unique = new Map<string, ParsedTransaction>();
  for (const row of rows) if (!unique.has(row.dedupeKey)) unique.set(row.dedupeKey, row);

  // Keys of soft-deleted rows are still in the store, so a transaction the user
  // deleted is not brought back by importing the same statement again.
  const existing = await deps.store.existingKeys([...unique.keys()]);
  const fresh = [...unique.values()].filter((r) => !existing.has(r.dedupeKey));

  const summary: ImportSummary = {
    parsed: rows.length,
    skippedLines,
    duplicatesInFile: rows.length - unique.size,
    alreadyStored: unique.size - fresh.length,
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
            paymentMethod: inferPaymentMethod(row.narration),
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
