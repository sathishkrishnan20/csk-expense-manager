import {
  FALLBACK,
  INCOME_CATEGORY,
  INCOME_FALLBACK,
  isIncomeCategory,
  isOthersLike,
  type CategoryDef,
  type Classification,
} from "./masterData";

export type { Classification };
export type Direction = "debit" | "credit";

// What the model may choose from, for one direction. Debits never see Income;
// credits only see Income.
export function allowedCategories(all: CategoryDef[], direction: Direction): CategoryDef[] {
  return all.filter((c) => isIncomeCategory(c.category) === (direction === "credit"));
}

export function fallbackFor(direction: Direction): Classification {
  return direction === "credit" ? INCOME_FALLBACK : FALLBACK;
}

// Validates a model answer against the user's current categories (case-insensitive).
// A known category with an unknown subcategory falls to that category's own
// "Others"/"Other" if it has one; anything else falls to the global fallback.
export function normalizeClassification(
  all: CategoryDef[],
  direction: Direction,
  category: unknown,
  subcategory: unknown,
): Classification {
  const fallback = fallbackFor(direction);
  if (typeof category !== "string" || typeof subcategory !== "string") return fallback;

  const allowed = allowedCategories(all, direction);
  const cat = allowed.find((c) => c.category.toLowerCase() === category.trim().toLowerCase());
  if (!cat) return fallback;

  const wanted = subcategory.trim().toLowerCase();
  const exact = cat.subcategories.find((s) => s.toLowerCase() === wanted);
  if (exact) return { category: cat.category, subcategory: exact };

  const others = cat.subcategories.find(isOthersLike);
  return others ? { category: cat.category, subcategory: others } : fallback;
}

export { INCOME_CATEGORY };
