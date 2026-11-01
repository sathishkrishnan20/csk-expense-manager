import {
  FALLBACK,
  INCOME_CATEGORY,
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

// classified_by value of a hand-added entry whose category the owner left for the AI
// ("Categorise later"). Re-classify picks these up; once labelled the value becomes the model id.
export const PENDING_AI = "pending";

// The same for both directions: an entry the AI cannot place stays in Others : Uncategorised.
export function fallbackFor(_direction: Direction): Classification {
  return FALLBACK;
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
