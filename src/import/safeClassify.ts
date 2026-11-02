import { FALLBACK } from "../domain/masterData";
import type { Classification, Direction } from "../domain/taxonomy";
import type { ParsedTransaction } from "../domain/statementParser";

type Classify = (rows: ParsedTransaction[], direction: Direction) => Promise<Map<number, Classification>>;

// A classifier that cannot fail, for entries that must be saved whether or not the AI can be reached (a bank SMS): when there is no
// AI (null, for example no API key) or its call throws (no internet, a quota), every row of that batch is answered with
// "Others : Uncategorised", so it is saved there and a later Re-classify gives it a category. The first reason is passed to `onProblem`.
export function classifyOrFallback(classify: Classify | null, onProblem: (reason: string) => void): Classify {
  const fallback = (rows: ParsedTransaction[]) =>
    new Map<number, Classification>(rows.map((_, i) => [i, { category: FALLBACK.category, subcategory: FALLBACK.subcategory }]));
  return async (rows, direction) => {
    if (!classify) return fallback(rows);
    try {
      return await classify(rows, direction);
    } catch (err) {
      onProblem(err instanceof Error ? err.message : String(err));
      return fallback(rows);
    }
  };
}
