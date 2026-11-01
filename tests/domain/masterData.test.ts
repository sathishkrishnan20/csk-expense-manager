import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  FALLBACK,
  RECATEGORISE,
  isRecategorise,
  isProtectedCategory,
  isProtectedSubcategory,
  sortOthersLast,
} from "../../src/domain/masterData";

test("default categories are the owner's own list, Income first, fallback last", () => {
  assert.equal(DEFAULT_CATEGORIES[0].category, "Income");
  assert.deepEqual(
    DEFAULT_CATEGORIES.map((c) => c.category),
    [
      "Income",
      "Entertainment",
      "Family Support",
      "Automobile",
      "Food & Groceries",
      "Health Care",
      "Home office",
      "Households",
      "Insurance",
      "Loans",
      "Personal and Family Care",
      "Travel",
      "Utilities and Bills",
      "Credit Card Bills",
      "Savings",
      "Others",
    ],
  );
  const last = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  assert.deepEqual(last, { category: FALLBACK.category, subcategories: [FALLBACK.subcategory] });
});

test("no category repeats a subcategory name, and Income has no Others", () => {
  for (const c of DEFAULT_CATEGORIES) {
    assert.equal(new Set(c.subcategories).size, c.subcategories.length, c.category);
  }
  // Income has no "Others": an entry nothing fits stays in Others : Uncategorised, credit or debit.
  const income = DEFAULT_CATEGORIES.find((c) => c.category === "Income");
  assert.ok(income && income.subcategories.length > 0 && !income.subcategories.includes("Others"));
});

test("payment modes match the web app", () => {
  assert.deepEqual(DEFAULT_PAYMENT_METHODS, ["Cash", "UPI", "Credit Card", "Debit Card", "Net banking"]);
});

test("protected entries", () => {
  assert.ok(isProtectedCategory("Income") && isProtectedCategory("Others"));
  assert.ok(!isProtectedCategory("Food"));
  assert.ok(isProtectedSubcategory("Others", "Uncategorised"));
  assert.ok(!isProtectedSubcategory("Others", "Something else"));
});

test("Other and Others sort to the end of a dropdown", () => {
  assert.deepEqual(sortOthersLast(["Others", "Fuel", "Other", "Tax"]), ["Fuel", "Tax", "Others", "Other"]);
});

test("Recategorise with AI is an option under Others, never a stored or AI-chosen category", () => {
  assert.equal(RECATEGORISE.category, FALLBACK.category);
  assert.ok(isRecategorise(RECATEGORISE.category, RECATEGORISE.subcategory));
  assert.ok(!isRecategorise(FALLBACK.category, FALLBACK.subcategory));
  const others = DEFAULT_CATEGORIES.find((c) => c.category === FALLBACK.category);
  assert.ok(!others?.subcategories.includes(RECATEGORISE.subcategory));
});

test("Chaats is a default Food & Groceries subcategory with a description", () => {
  const food = DEFAULT_CATEGORIES.find((c) => c.category === "Food & Groceries");
  assert.ok(food?.subcategories.includes("Chaats"));
  assert.ok(!food?.subcategories.includes("Charts"));
  assert.match(food?.descriptions?.Chaats ?? "", /Panipoori/);
  for (const c of DEFAULT_CATEGORIES) {
    for (const [sub, text] of Object.entries(c.descriptions ?? {})) assert.ok(c.subcategories.includes(sub), `${c.category}: ${sub}`);
  }
});
