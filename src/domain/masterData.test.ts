import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  FALLBACK,
  INCOME_FALLBACK,
  isProtectedCategory,
  isProtectedSubcategory,
  sortOthersLast,
} from "./masterData";

test("default categories mirror the web app's live list, Income first, fallback last", () => {
  assert.equal(DEFAULT_CATEGORIES[0].category, "Income");
  assert.deepEqual(
    DEFAULT_CATEGORIES.map((c) => c.category),
    [
      "Income",
      "Entertainment",
      "Family",
      "Automobile",
      "Food",
      "Health Care",
      "Home Office",
      "Household",
      "Insurance",
      "Loans",
      "Personal",
      "Tax",
      "Travel",
      "Utilities",
      "Payment",
      "Savings",
      "Car",
      "Others",
    ],
  );
  const last = DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  assert.deepEqual(last, { category: FALLBACK.category, subcategories: [FALLBACK.subcategory] });
});

test("no category repeats a subcategory name, and the Income fallback exists", () => {
  for (const c of DEFAULT_CATEGORIES) {
    assert.equal(new Set(c.subcategories).size, c.subcategories.length, c.category);
  }
  const income = DEFAULT_CATEGORIES.find((c) => c.category === INCOME_FALLBACK.category);
  assert.ok(income?.subcategories.includes(INCOME_FALLBACK.subcategory));
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
