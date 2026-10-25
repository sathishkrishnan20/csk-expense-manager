import { FALLBACK, isProtectedCategory, isProtectedSubcategory, type CategoryDef } from "./masterData";

export interface SubEdit {
  original: string | null; // null for a newly added row
  name: string;
}

export interface CategoryEdit {
  original: string | null; // null when adding a new category
  name: string;
  subs: SubEdit[];
}

// Returns a message for the first problem, or null when the edit can be saved.
export function validateCategoryEdit(all: CategoryDef[], edit: CategoryEdit): string | null {
  const name = edit.name.trim();
  if (!name) return "Enter a category name.";

  if (edit.original !== null && isProtectedCategory(edit.original) && name !== edit.original) {
    return `"${edit.original}" is built in and cannot be renamed.`;
  }
  const clash = all.some(
    (c) => c.category.toLowerCase() === name.toLowerCase() && c.category !== edit.original,
  );
  if (clash) return `A category named "${name}" already exists.`;

  const subs = edit.subs.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name !== "" || s.original !== null);
  if (subs.some((s) => s.name === "")) return "A subcategory name cannot be empty.";
  if (subs.length === 0) return "Add at least one subcategory.";

  const seen = new Set<string>();
  for (const s of subs) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) return `"${s.name}" appears twice.`;
    seen.add(key);
  }

  if (edit.original !== null) {
    const current = all.find((c) => c.category === edit.original);
    for (const sub of current?.subcategories ?? []) {
      if (!isProtectedSubcategory(edit.original, sub)) continue;
      const kept = subs.find((s) => s.original === sub);
      if (!kept) return `"${FALLBACK.subcategory}" is built in and cannot be removed.`;
      if (kept.name !== sub) return `"${FALLBACK.subcategory}" is built in and cannot be renamed.`;
    }
  }
  return null;
}

export function validateNewName(existing: string[], name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name.";
  if (existing.some((e) => e.toLowerCase() === trimmed.toLowerCase())) return `"${trimmed}" already exists.`;
  return null;
}
