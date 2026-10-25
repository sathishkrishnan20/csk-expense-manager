import { FALLBACK, sortOthersLast, type CategoryDef } from "./masterData";

export type DirectionFilter = "all" | "debit" | "credit";

// "categorised" hides the Others : Uncategorised rows, "uncategorised" shows only those.
export type UncategorisedMode = "all" | "categorised" | "uncategorised";

export interface TransactionFilters {
  start: string | null; // inclusive, ISO yyyy-mm-dd
  end: string | null; // inclusive
  direction: DirectionFilter;
  category: string | null;
  subcategory: string | null; // only meaningful together with a category
  uncategorised: UncategorisedMode;
}

export const NO_FILTERS: TransactionFilters = {
  start: null,
  end: null,
  direction: "all",
  category: null,
  subcategory: null,
  uncategorised: "all",
};

export interface Filterable {
  txnDate: string;
  direction: "debit" | "credit";
  category: string;
  subcategory: string;
}

// "Uncategorised" is the fallback the AI uses for debits that fit none of the owner's
// categories (the fallback for credits, Income : Others, is a normal Income entry).
export function isUncategorised(t: Pick<Filterable, "category" | "subcategory">): boolean {
  return t.category === FALLBACK.category && t.subcategory === FALLBACK.subcategory;
}

export function applyFilters<T extends Filterable>(rows: T[], f: TransactionFilters): T[] {
  return rows.filter((t) => {
    if (f.start && t.txnDate < f.start) return false;
    if (f.end && t.txnDate > f.end) return false;
    if (f.direction !== "all" && t.direction !== f.direction) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.category && f.subcategory && t.subcategory !== f.subcategory) return false;
    if (f.uncategorised === "categorised" && isUncategorised(t)) return false;
    if (f.uncategorised === "uncategorised" && !isUncategorised(t)) return false;
    return true;
  });
}

// How many filters are switched on, for the badge on the Filters bar.
export function activeFilterCount(f: TransactionFilters): number {
  return [
    f.start !== null || f.end !== null,
    f.direction !== "all",
    f.category !== null,
    f.category !== null && f.subcategory !== null,
    f.uncategorised !== "all",
  ].filter(Boolean).length;
}

// Changing the category clears the subcategory, which belongs to the old one.
export function withCategory(f: TransactionFilters, category: string | null): TransactionFilters {
  return { ...f, category, subcategory: null };
}

export function isRangeValid(start: string | null, end: string | null): boolean {
  return !start || !end || start <= end;
}

const alphabetical = (a: string, b: string) => a.localeCompare(b);

// The owner's current categories first, in Config order; then any category that only
// exists on old transactions (deleted or renamed since), so those stay filterable.
export function categoryOptions(config: CategoryDef[], rows: Pick<Filterable, "category">[]): string[] {
  const known = config.map((c) => c.category);
  const extra = [...new Set(rows.map((r) => r.category))].filter((c) => !known.includes(c)).sort(alphabetical);
  return [...known, ...extra];
}

export function subcategoryOptions(
  config: CategoryDef[],
  rows: Pick<Filterable, "category" | "subcategory">[],
  category: string,
): string[] {
  const known = sortOthersLast(config.find((c) => c.category === category)?.subcategories ?? []);
  const extra = [...new Set(rows.filter((r) => r.category === category).map((r) => r.subcategory))]
    .filter((s) => !known.includes(s))
    .sort(alphabetical);
  return [...known, ...extra];
}
