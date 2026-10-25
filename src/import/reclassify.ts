import { FALLBACK, INCOME_FALLBACK } from "../domain/masterData";
import type { Classification, Direction } from "../domain/taxonomy";

export interface ReclassifyCandidate {
  id: string;
  direction: Direction;
  amountPaise: number;
  payee: string | null;
  vpa: string | null;
  note: string | null;
  narration: string;
}

export interface ReclassifyDeps {
  list(): Promise<ReclassifyCandidate[]>;
  apply(updates: { id: string; classification: Classification }[]): Promise<void>;
  classify(rows: ReclassifyCandidate[], direction: Direction): Promise<Map<number, Classification>>;
  batchSize?: number;
  onProgress?: (message: string) => void;
}

export interface ReclassifySummary {
  total: number;
  moved: number; // now in a real category
  stillUncategorised: number;
  notProcessed: number;
  error: string | null;
}

const DEFAULT_BATCH_SIZE = 20;

function isFallback(direction: Direction, c: Classification): boolean {
  const fb = direction === "credit" ? INCOME_FALLBACK : FALLBACK;
  return c.category === fb.category && c.subcategory === fb.subcategory;
}

export async function reclassify(deps: ReclassifyDeps): Promise<ReclassifySummary> {
  const candidates = await deps.list();
  const summary: ReclassifySummary = {
    total: candidates.length,
    moved: 0,
    stillUncategorised: 0,
    notProcessed: 0,
    error: null,
  };

  const groups: { direction: Direction; rows: ReclassifyCandidate[] }[] = [
    { direction: "debit", rows: candidates.filter((c) => c.direction === "debit") },
    { direction: "credit", rows: candidates.filter((c) => c.direction === "credit") },
  ];
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  let done = 0;

  for (let g = 0; g < groups.length; g++) {
    const { direction, rows } = groups[g];
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      deps.onProgress?.(`Re-classifying ${Math.min(done + batch.length, candidates.length)} of ${candidates.length}…`);

      let result: Map<number, Classification>;
      try {
        result = await deps.classify(batch, direction);
      } catch (err) {
        summary.error = err instanceof Error ? err.message : String(err);
        const later = groups.slice(g + 1).reduce((n, x) => n + x.rows.length, 0);
        summary.notProcessed += rows.length - start + later;
        return summary;
      }

      const updates: { id: string; classification: Classification }[] = [];
      batch.forEach((row, index) => {
        const classification = result.get(index);
        if (!classification) {
          summary.notProcessed++;
          return;
        }
        updates.push({ id: row.id, classification });
        if (isFallback(direction, classification)) summary.stillUncategorised++;
        else summary.moved++;
      });
      await deps.apply(updates);
      done += batch.length;
    }
  }
  return summary;
}
