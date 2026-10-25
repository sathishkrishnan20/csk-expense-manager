import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCategoryEdit, validateNewName, type CategoryEdit } from "./categoryEdit";
import { DEFAULT_CATEGORIES } from "./masterData";

const sub = (name: string, original: string | null = name) => ({ original, name });

const edit = (over: Partial<CategoryEdit>): CategoryEdit => ({
  original: "Food",
  name: "Food",
  subs: ["Restaurant", "Groceries", "Snacks", "Others", "Fruits"].map((n) => sub(n)),
  ...over,
});

test("an unchanged category is valid", () => {
  assert.equal(validateCategoryEdit(DEFAULT_CATEGORIES, edit({})), null);
});

test("adding a new category with one subcategory is valid", () => {
  const e: CategoryEdit = { original: null, name: "Pets", subs: [sub("Vet", null)] };
  assert.equal(validateCategoryEdit(DEFAULT_CATEGORIES, e), null);
});

test("names are required and categories cannot repeat (case-insensitive)", () => {
  assert.match(validateCategoryEdit(DEFAULT_CATEGORIES, edit({ name: "  " }))!, /category name/);
  assert.match(validateCategoryEdit(DEFAULT_CATEGORIES, { original: null, name: "food", subs: [sub("x", null)] })!, /already exists/);
  assert.equal(validateCategoryEdit(DEFAULT_CATEGORIES, edit({ name: "FOOD" })), null); // only changing case of itself
});

test("subcategories: at least one, no blanks, no duplicates", () => {
  assert.match(validateCategoryEdit(DEFAULT_CATEGORIES, { original: null, name: "Pets", subs: [] })!, /at least one/);
  // a blank row that was just added is ignored, like in the web app
  assert.match(validateCategoryEdit(DEFAULT_CATEGORIES, { original: null, name: "Pets", subs: [sub("", null)] })!, /at least one/);
  assert.equal(
    validateCategoryEdit(DEFAULT_CATEGORIES, { original: null, name: "Pets", subs: [sub("Vet", null), sub(" ", null)] }),
    null,
  );
  // but blanking an existing subcategory is an error
  assert.match(
    validateCategoryEdit(DEFAULT_CATEGORIES, { original: "Food", name: "Food", subs: [{ original: "Restaurant", name: "" }] })!,
    /empty/,
  );
  assert.match(
    validateCategoryEdit(DEFAULT_CATEGORIES, { original: null, name: "Pets", subs: [sub("Vet", null), sub("vet", null)] })!,
    /twice/,
  );
});

test("Income and Others cannot be renamed; Uncategorised cannot be removed or renamed", () => {
  const income = DEFAULT_CATEGORIES.find((c) => c.category === "Income")!;
  const incomeEdit: CategoryEdit = {
    original: "Income",
    name: "Earnings",
    subs: income.subcategories.map((n) => sub(n)),
  };
  assert.match(validateCategoryEdit(DEFAULT_CATEGORIES, incomeEdit)!, /cannot be renamed/);

  assert.match(
    validateCategoryEdit(DEFAULT_CATEGORIES, { original: "Others", name: "Others", subs: [sub("Misc", null)] })!,
    /Uncategorised.*cannot be removed/,
  );
  assert.match(
    validateCategoryEdit(DEFAULT_CATEGORIES, {
      original: "Others",
      name: "Others",
      subs: [{ original: "Uncategorised", name: "Unsorted" }],
    })!,
    /cannot be renamed/,
  );
  // adding another subcategory under Others is fine
  assert.equal(
    validateCategoryEdit(DEFAULT_CATEGORIES, {
      original: "Others",
      name: "Others",
      subs: [sub("Uncategorised"), sub("Gifts", null)],
    }),
    null,
  );
  // Income subcategories can be changed freely
  assert.equal(validateCategoryEdit(DEFAULT_CATEGORIES, { ...incomeEdit, name: "Income", subs: [sub("Salary")] }), null);
});

test("simple names for payment methods", () => {
  assert.equal(validateNewName(["Cash", "UPI"], "Wallet"), null);
  assert.match(validateNewName(["Cash", "UPI"], "upi")!, /already exists/);
  assert.match(validateNewName([], "  ")!, /Enter a name/);
});
