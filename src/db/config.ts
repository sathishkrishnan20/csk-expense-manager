import { validateCategoryEdit, validateNewName, type CategoryEdit } from "../domain/categoryEdit";
import { cleanDescription, isProtectedCategory, type CategoryDef } from "../domain/masterData";
import { getDb, inTransaction } from "./database";

export async function loadCategories(): Promise<CategoryDef[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category: string; subcategory: string; description: string | null }>(
    "SELECT category, subcategory, description FROM categories ORDER BY sort, id",
  );
  const grouped = new Map<string, CategoryDef>();
  for (const { category, subcategory, description } of rows) {
    let def = grouped.get(category);
    if (!def) grouped.set(category, (def = { category, subcategories: [] }));
    def.subcategories.push(subcategory);
    const text = cleanDescription(description ?? "");
    if (text) (def.descriptions ??= {})[subcategory] = text;
  }
  return [...grouped.values()];
}

// Renames also update existing transactions so history stays under one name.
// Removing a subcategory or category leaves old transactions as they are.
export async function saveCategory(edit: CategoryEdit): Promise<void> {
  const problem = validateCategoryEdit(await loadCategories(), edit);
  if (problem) throw new Error(problem);

  const name = edit.name.trim();
  const subs = edit.subs
    .map((s) => ({ original: s.original, name: s.name.trim(), description: cleanDescription(s.description ?? "") || null }))
    .filter((s) => s.name !== "");

  const db = await getDb();
  await inTransaction(db, async (txn) => {
    if (edit.original !== null && edit.original !== name) {
      await txn.runAsync("UPDATE categories SET category = ? WHERE category = ?", [name, edit.original]);
      await txn.runAsync("UPDATE transactions SET category = ? WHERE category = ?", [name, edit.original]);
    }

    if (edit.original !== null) {
      const keep = new Set(subs.map((s) => s.original).filter((o): o is string => o !== null));
      const current = await txn.getAllAsync<{ subcategory: string }>(
        "SELECT subcategory FROM categories WHERE category = ?",
        [name],
      );
      for (const { subcategory } of current) {
        if (!keep.has(subcategory)) {
          await txn.runAsync("DELETE FROM categories WHERE category = ? AND subcategory = ?", [name, subcategory]);
        }
      }
    }

    // Two phases so swapping two names cannot trip the UNIQUE constraint.
    const renames = subs.filter((s) => s.original !== null && s.original !== s.name);
    for (const [i, r] of renames.entries()) {
      await txn.runAsync("UPDATE categories SET subcategory = ? WHERE category = ? AND subcategory = ?", [
        `\u0000rename-${i}`,
        name,
        r.original,
      ]);
    }
    for (const [i, r] of renames.entries()) {
      await txn.runAsync("UPDATE categories SET subcategory = ? WHERE category = ? AND subcategory = ?", [
        r.name,
        name,
        `\u0000rename-${i}`,
      ]);
      await txn.runAsync("UPDATE transactions SET subcategory = ? WHERE category = ? AND subcategory = ?", [
        r.name,
        name,
        r.original,
      ]);
    }

    // Kept subcategories take the description as edited (after the renames above, so they are found by their new name).
    for (const s of subs.filter((x) => x.original !== null)) {
      await txn.runAsync("UPDATE categories SET description = ? WHERE category = ? AND subcategory = ?", [
        s.description,
        name,
        s.name,
      ]);
    }

    const added = subs.filter((s) => s.original === null);
    if (added.length > 0) {
      const max = await txn.getFirstAsync<{ m: number }>("SELECT COALESCE(MAX(sort), 0) AS m FROM categories");
      let sort = (max?.m ?? 0) + 1;
      for (const s of added) {
        await txn.runAsync("INSERT INTO categories (category, subcategory, sort, description) VALUES (?, ?, ?, ?)", [
          name,
          s.name,
          sort++,
          s.description,
        ]);
      }
    }
  });
}

export async function deleteCategory(category: string): Promise<void> {
  if (isProtectedCategory(category)) throw new Error(`"${category}" is built in and cannot be deleted.`);
  const db = await getDb();
  await db.runAsync("DELETE FROM categories WHERE category = ?", [category]);
}

export async function loadPaymentMethods(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM payment_methods ORDER BY sort");
  return rows.map((r) => r.name);
}

export async function addPaymentMethod(name: string): Promise<void> {
  const problem = validateNewName(await loadPaymentMethods(), name);
  if (problem) throw new Error(problem);
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO payment_methods (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM payment_methods))",
    [name.trim()],
  );
}

export async function removePaymentMethod(name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM payment_methods WHERE name = ?", [name]);
}
