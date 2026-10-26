import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_FILTERS,
  activeFilterCount,
  applyFilters,
  categoryOptions,
  isRangeValid,
  isUncategorised,
  subcategoryOptions,
  withCategory,
  type Filterable,
  type TransactionFilters,
} from "../../src/domain/transactionFilters";

const t = (id: string, txnDate: string, direction: "debit" | "credit", category: string, subcategory: string, classifiedBy?: string) => ({
  id,
  txnDate,
  direction,
  category,
  subcategory,
  classifiedBy,
});

const ROWS = [
  t("a", "2026-10-01", "debit", "Food", "Groceries"),
  t("b", "2026-10-10", "debit", "Food", "Snacks"),
  t("c", "2026-10-15", "debit", "Others", "Uncategorised", "unresolved"),
  t("d", "2026-10-20", "credit", "Income", "Salary"),
  t("e", "2026-10-31", "debit", "Travel", "Taxi"),
  t("f", "2026-11-02", "credit", "Income", "Others"),
];

const ids = (rows: (Filterable & { id: string })[]) => rows.map((r) => r.id).join("");
const filters = (over: Partial<TransactionFilters>): TransactionFilters => ({ ...NO_FILTERS, ...over });

test("no filters keeps everything, in the same order", () => {
  assert.equal(ids(applyFilters(ROWS, NO_FILTERS)), "abcdef");
});

test("date range is inclusive on both ends and either end can be open", () => {
  assert.equal(ids(applyFilters(ROWS, filters({ start: "2026-10-10", end: "2026-10-20" }))), "bcd");
  assert.equal(ids(applyFilters(ROWS, filters({ start: "2026-10-31" }))), "ef");
  assert.equal(ids(applyFilters(ROWS, filters({ end: "2026-10-01" }))), "a");
});

test("type filter", () => {
  assert.equal(ids(applyFilters(ROWS, filters({ direction: "credit" }))), "df");
  assert.equal(ids(applyFilters(ROWS, filters({ direction: "debit" }))), "abce");
});

test("category, and subcategory within it", () => {
  assert.equal(ids(applyFilters(ROWS, filters({ category: "Food" }))), "ab");
  assert.equal(ids(applyFilters(ROWS, filters({ category: "Food", subcategory: "Snacks" }))), "b");
  // a subcategory with no category chosen does nothing
  assert.equal(ids(applyFilters(ROWS, filters({ subcategory: "Snacks" }))), "abcdef");
});

test("uncategorised: all, categorised only (hides the fallback), uncategorised only", () => {
  assert.ok(isUncategorised(ROWS[2]));
  assert.ok(!isUncategorised(ROWS[5])); // Income : Others is a normal Income entry
  assert.equal(ids(applyFilters(ROWS, filters({ uncategorised: "categorised" }))), "abdef");
  assert.equal(ids(applyFilters(ROWS, filters({ uncategorised: "uncategorised" }))), "c");
});

test("filters combine", () => {
  const f = filters({ start: "2026-10-05", end: "2026-10-31", direction: "debit", uncategorised: "categorised" });
  assert.equal(ids(applyFilters(ROWS, f)), "be");
  assert.equal(ids(applyFilters(ROWS, filters({ category: "Others", uncategorised: "categorised" }))), "");
});

test("the badge counts each switched-on filter once", () => {
  assert.equal(activeFilterCount(NO_FILTERS), 0);
  assert.equal(activeFilterCount(filters({ start: "2026-10-01", end: "2026-10-31" })), 1);
  assert.equal(activeFilterCount(filters({ direction: "debit", uncategorised: "categorised" })), 2);
  assert.equal(activeFilterCount(filters({ category: "Food" })), 1);
  assert.equal(activeFilterCount(filters({ category: "Food", subcategory: "Snacks" })), 2);
});

test("changing the category clears the subcategory", () => {
  const f = withCategory(filters({ category: "Food", subcategory: "Snacks" }), "Travel");
  assert.deepEqual([f.category, f.subcategory], ["Travel", null]);
  assert.deepEqual(withCategory(f, null), { ...NO_FILTERS, category: null });
});

test("range validity", () => {
  assert.ok(isRangeValid(null, null) && isRangeValid("2026-10-01", null) && isRangeValid(null, "2026-10-01"));
  assert.ok(isRangeValid("2026-10-01", "2026-10-01"));
  assert.ok(!isRangeValid("2026-10-02", "2026-10-01"));
});

test("options: current categories in Config order, then labels that only exist on old rows", () => {
  const config = [
    { category: "Food", subcategories: ["Restaurant", "Others", "Groceries"] },
    { category: "Travel", subcategories: ["Taxi"] },
  ];
  const rows = [
    { category: "Beverage", subcategory: "Water" },
    { category: "Food", subcategory: "Chat items" },
    { category: "Food", subcategory: "Groceries" },
    { category: "Transport", subcategory: "Taxi" },
  ];
  assert.deepEqual(categoryOptions(config, rows), ["Food", "Travel", "Beverage", "Transport"]);
  assert.deepEqual(subcategoryOptions(config, rows, "Food"), ["Restaurant", "Groceries", "Others", "Chat items"]);
  assert.deepEqual(subcategoryOptions(config, rows, "Transport"), ["Taxi"]);
  assert.deepEqual(subcategoryOptions(config, rows, "Nothing"), []);
});

test("the \"couldn't categorise\" list holds only what the AI gave up on", () => {
  const rows = [...ROWS, t("g", "2026-10-16", "debit", "Others", "Uncategorised", "gemini-3.5-flash-lite")];
  // g is uncategorised but the AI has not given up yet; c has used up its attempts
  assert.equal(ids(applyFilters(rows, filters({ uncategorised: "unresolved" }))), "c");
  assert.equal(ids(applyFilters(rows, filters({ uncategorised: "uncategorised" }))), "cg");
  assert.equal(activeFilterCount(filters({ uncategorised: "unresolved" })), 1);
});
