import { test } from "node:test";
import assert from "node:assert/strict";
import type { CategoryDef } from "../../src/domain/masterData";
import {
  MAX_SUGGESTION_NAME,
  acceptSuggestion,
  describeStatus,
  expenseCategoryNames,
  snapToExisting,
  subcategoryNames,
  suggestionKey,
  suggestionStatus,
  tidyName,
  validateSuggestion,
} from "../../src/domain/suggestions";

const MASTER: CategoryDef[] = [
  { category: "Income", subcategories: ["Salary"] },
  { category: "Entertainment", subcategories: ["Concert", "Sports"] },
  { category: "Others", subcategories: ["Uncategorised"] },
];

test("names are tidied to one line", () => {
  assert.equal(tidyName("  Carrom \n board  "), "Carrom board");
  assert.equal(tidyName(7), "");
  assert.equal(tidyName(undefined), "");
});

test("an expense suggestion needs a category and subcategory, not Income or Others", () => {
  assert.equal(validateSuggestion("debit", "Entertainment", "Carrom"), null);
  assert.match(validateSuggestion("debit", "", "Carrom")!, /category/);
  assert.match(validateSuggestion("debit", "Entertainment", " ")!, /subcategory/);
  assert.match(validateSuggestion("debit", "income", "Gift")!, /Income is for credits/);
  assert.match(validateSuggestion("debit", "Others", "Misc")!, /uncategorised/);
  assert.match(validateSuggestion("debit", "x".repeat(MAX_SUGGESTION_NAME + 1), "y")!, /at most/);
});

test("a credit suggestion goes under Income only", () => {
  assert.equal(validateSuggestion("credit", "Income", "Cashback"), null);
  assert.match(validateSuggestion("credit", "Entertainment", "Cashback")!, /Income/);
});

test("accepting a model suggestion tidies it, snaps to existing spelling and forces Income for credits", () => {
  assert.deepEqual(acceptSuggestion(MASTER, "debit", "entertainment", " carrom "), { category: "Entertainment", subcategory: "carrom" });
  assert.deepEqual(acceptSuggestion(MASTER, "debit", "ENTERTAINMENT", "sports"), { category: "Entertainment", subcategory: "Sports" });
  assert.deepEqual(acceptSuggestion(MASTER, "credit", "Anything", "salary"), { category: "Income", subcategory: "Salary" });
  assert.equal(acceptSuggestion(MASTER, "debit", "Income", "Gift"), null);
  assert.equal(acceptSuggestion(MASTER, "debit", "Pets", ""), null);
  assert.equal(acceptSuggestion(MASTER, "debit", 3, 4), null);
});

test("status says what approving would add", () => {
  assert.equal(suggestionStatus(MASTER, { category: "Pets", subcategory: "Vet" }), "new-category");
  assert.equal(suggestionStatus(MASTER, { category: "entertainment", subcategory: "Carrom" }), "new-subcategory");
  assert.equal(suggestionStatus(MASTER, { category: "Entertainment", subcategory: "SPORTS" }), "existing");
  assert.equal(describeStatus("new-subcategory", "Entertainment"), "New subcategory under Entertainment");
  assert.equal(describeStatus("new-category", "Pets"), "New category");
  assert.equal(snapToExisting(MASTER, "entertainment", "sports").subcategory, "Sports");
});

test("entries with the same suggestion share a key, whatever the case or spacing", () => {
  assert.equal(
    suggestionKey({ category: "Entertainment", subcategory: "Carrom" }),
    suggestionKey({ category: " entertainment ", subcategory: "CARROM" }),
  );
  assert.notEqual(suggestionKey({ category: "A", subcategory: "B" }), suggestionKey({ category: "A", subcategory: "C" }));
});

test("the picker offers every category except Income and Others for an expense", () => {
  assert.deepEqual(expenseCategoryNames(MASTER), ["Entertainment"]);
});

test("the picker lists a category's subcategories with Other-like ones last, and none for an unknown category", () => {
  const master: CategoryDef[] = [{ category: "Food", subcategories: ["Other", "Dining", "Groceries"] }];
  assert.deepEqual(subcategoryNames(master, "Food"), ["Dining", "Groceries", "Other"]);
  assert.deepEqual(subcategoryNames(master, "Carrom"), []);
});
