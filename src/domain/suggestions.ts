// When the AI cannot place an entry it can also say where the entry could go: a category and subcategory that are
// not in the owner's list yet. The owner approves (the names are added to the list and the entry is linked to them),
// edits, or rejects each one. Nothing is added until then. Works for debits and credits; a credit always goes under Income.

import { FALLBACK, INCOME_CATEGORY, type CategoryDef, type Suggestion } from "./masterData";
import type { Direction } from "./taxonomy";

export const MAX_SUGGESTION_NAME = 40;

// One line, trimmed. Anything that is not text is empty.
export const tidyName = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Checks a category and subcategory the owner (or the AI) wants to add for an entry; returns a message for the
// first problem, or null. A credit's category is always Income.
export function validateSuggestion(direction: Direction, category: string, subcategory: string): string | null {
  const cat = tidyName(category);
  const sub = tidyName(subcategory);
  if (!sub) return "Enter a subcategory.";
  if (direction === "debit" && !cat) return "Enter a category.";
  if (cat.length > MAX_SUGGESTION_NAME || sub.length > MAX_SUGGESTION_NAME) {
    return `Names can be at most ${MAX_SUGGESTION_NAME} characters.`;
  }
  if (direction === "credit") return same(cat, INCOME_CATEGORY) ? null : "A credit goes under Income.";
  if (same(cat, INCOME_CATEGORY)) return "Income is for credits. Choose an expense category.";
  if (same(cat, FALLBACK.category)) return `"${FALLBACK.category}" is the place for uncategorised entries. Choose another category.`;
  return null;
}

// Uses the spelling of a category or subcategory that already exists (case does not matter).
export function snapToExisting(master: readonly CategoryDef[], category: string, subcategory: string): Suggestion {
  const cat = master.find((c) => same(c.category, tidyName(category)));
  const sub = cat?.subcategories.find((s) => same(s, tidyName(subcategory)));
  return { category: cat?.category ?? tidyName(category), subcategory: sub ?? tidyName(subcategory) };
}

// What the model sent as a suggestion, or null when it cannot be used.
export function acceptSuggestion(
  master: readonly CategoryDef[],
  direction: Direction,
  rawCategory: unknown,
  rawSubcategory: unknown,
): Suggestion | null {
  const category = direction === "credit" ? INCOME_CATEGORY : tidyName(rawCategory);
  const subcategory = tidyName(rawSubcategory);
  if (!subcategory || validateSuggestion(direction, category, subcategory)) return null;
  return snapToExisting(master, category, subcategory);
}

export type SuggestionStatus = "new-category" | "new-subcategory" | "existing";

export function suggestionStatus(master: readonly CategoryDef[], s: Suggestion): SuggestionStatus {
  const cat = master.find((c) => same(c.category, tidyName(s.category)));
  if (!cat) return "new-category";
  return cat.subcategories.some((x) => same(x, tidyName(s.subcategory))) ? "existing" : "new-subcategory";
}

// Entries with the same suggestion are shown together, so one edit and one tap can settle all of them.
export const suggestionKey = (s: Suggestion): string => `${tidyName(s.category).toLowerCase()}|${tidyName(s.subcategory).toLowerCase()}`;

export function describeStatus(status: SuggestionStatus, category: string): string {
  if (status === "new-category") return "New category";
  if (status === "new-subcategory") return `New subcategory under ${category}`;
  return "Already in your list";
}
