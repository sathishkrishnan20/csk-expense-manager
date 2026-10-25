import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchema, buildSystemPrompt, buildUserPrompt, classifyBatch, type ClassifiableRow } from "./classify";
import { DEFAULT_CATEGORIES, type CategoryDef } from "../domain/masterData";
import type { JsonSchema, LlmCall } from "./providers";

const row = (over: Partial<ClassifiableRow> = {}): ClassifiableRow => ({
  amountPaise: 12500,
  payee: "SWIGGY",
  vpa: "swiggy@icici",
  note: null,
  narration: "UPI/SWIGGY/swiggy@icici/UPI/ICICI/611111111111/ICI1",
  ...over,
});

test("debit prompt lists the user's expense categories, never Income, and names the fallback", () => {
  const prompt = buildSystemPrompt(DEFAULT_CATEGORIES, "debit");
  assert.match(prompt, /- Food: Restaurant, Groceries, Snacks, Others, Fruits/);
  assert.match(prompt, /- Payment: ICICI Credit Card/);
  assert.match(prompt, /- Others: Uncategorised/);
  assert.doesNotMatch(prompt, /- Income:/);
  assert.match(prompt, /category "Others" and subcategory "Uncategorised"/);
});

test("credit prompt lists only Income and falls back to Income / Others", () => {
  const prompt = buildSystemPrompt(DEFAULT_CATEGORIES, "credit");
  assert.match(prompt, /- Income: Salary, Equities/);
  assert.doesNotMatch(prompt, /- Food:/);
  assert.match(prompt, /category "Income" and subcategory "Others"/);
});

test("a category added by the user shows up in the prompt and the schema", () => {
  const custom: CategoryDef[] = [...DEFAULT_CATEGORIES, { category: "Pets", subcategories: ["Vet", "Food"] }];
  assert.match(buildSystemPrompt(custom, "debit"), /- Pets: Vet, Food/);

  let seenSchema: JsonSchema | undefined;
  const call: LlmCall = async (_s, _u, schema) => {
    seenSchema = schema;
    return { results: [{ id: 0, category: "Pets", subcategory: "Vet" }] };
  };
  return classifyBatch([row()], "debit", custom, call).then((out) => {
    assert.deepEqual(out.get(0), { category: "Pets", subcategory: "Vet" });
    const names = (seenSchema as any).properties.results.items.properties.category.enum as string[];
    assert.ok(names.includes("Pets") && names.includes("Others") && !names.includes("Income"));
  });
});

test("the user prompt carries note, payee and amount in rupees", () => {
  const prompt = buildUserPrompt([row({ note: "pampers" })], "debit");
  assert.match(prompt, /^Classify these 1 debits:/);
  assert.match(prompt, /"amount":125/);
  assert.match(prompt, /"note":"pampers"/);
  assert.match(buildUserPrompt([row()], "credit"), /^Classify these 1 credits:/);
  assert.deepEqual(buildSchema(["A"]).required, ["results"]);
});

test("a hand entry is sent with its description and without an empty bank narration", () => {
  const hand = row({ payee: "Ravi Stores", vpa: null, note: null, narration: "", description: "vegetables" });
  const prompt = buildUserPrompt([hand], "debit");
  assert.match(prompt, /"description":"vegetables"/);
  assert.match(prompt, /"payee":"Ravi Stores"/);
  assert.doesNotMatch(prompt, /narration/);
  assert.match(buildSystemPrompt(DEFAULT_CATEGORIES, "debit"), /"description" is a remark/);
  assert.match(buildSystemPrompt(DEFAULT_CATEGORIES, "credit"), /"description" is a remark/);
  // bank rows have no description field at all
  assert.doesNotMatch(buildUserPrompt([row()], "debit"), /description/);
});

test("model answers are validated against the current categories", async () => {
  const rows = Array.from({ length: 7 }, () => row());
  const call: LlmCall = async () => ({
    results: [
      { id: 0, category: "food", subcategory: "restaurant" }, // case-insensitive match
      { id: 1, category: "Space Travel", subcategory: "Moon" }, // invented category -> Others / Uncategorised
      { id: 2, category: "Food", subcategory: "Bakery" }, // known category, unknown sub -> that category's Others
      { id: 3, category: "Health Care", subcategory: "Spa" }, // its sub is called "Other"
      { id: 4, category: "Car", subcategory: "Wash" }, // no Others in Car -> Others / Uncategorised
      { id: 5, category: "Income", subcategory: "Salary" }, // debits can never be Income
      { id: 99, category: "Food", subcategory: "Groceries" }, // out of range, ignored
      { id: 0, category: "Health Care", subcategory: "Dental" }, // duplicate id, ignored
    ],
  });

  const out = await classifyBatch(rows, "debit", DEFAULT_CATEGORIES, call);
  assert.deepEqual(out.get(0), { category: "Food", subcategory: "Restaurant" });
  assert.deepEqual(out.get(1), { category: "Others", subcategory: "Uncategorised" });
  assert.deepEqual(out.get(2), { category: "Food", subcategory: "Others" });
  assert.deepEqual(out.get(3), { category: "Health Care", subcategory: "Other" });
  assert.deepEqual(out.get(4), { category: "Others", subcategory: "Uncategorised" });
  assert.deepEqual(out.get(5), { category: "Others", subcategory: "Uncategorised" });
  assert.equal(out.has(6), false);
  assert.equal(out.size, 6);
});

test("credits can only land in Income", async () => {
  const call: LlmCall = async () => ({
    results: [
      { id: 0, category: "Income", subcategory: "salary" },
      { id: 1, category: "Food", subcategory: "Restaurant" },
      { id: 2, category: "Income", subcategory: "Lottery" },
    ],
  });
  const out = await classifyBatch([row(), row(), row()], "credit", DEFAULT_CATEGORIES, call);
  assert.deepEqual(out.get(0), { category: "Income", subcategory: "Salary" });
  assert.deepEqual(out.get(1), { category: "Income", subcategory: "Others" });
  assert.deepEqual(out.get(2), { category: "Income", subcategory: "Others" });
});

test("a malformed answer is rejected", async () => {
  await assert.rejects(
    () => classifyBatch([row()], "debit", DEFAULT_CATEGORIES, async () => ({ nope: true })),
    /results list/,
  );
});
