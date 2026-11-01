import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchema, buildSystemPrompt, buildUserPrompt, classifyBatch, type ClassifiableRow } from "../../src/llm/classify";
import { DEFAULT_CATEGORIES, type CategoryDef } from "../../src/domain/masterData";
import type { JsonSchema, LlmCall } from "../../src/llm/providers";

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
  assert.match(prompt, /- Food & Groceries: Dining out & Food Delivery, Snacks/);
  assert.match(prompt, /- Credit Card Bills: ICICI Credit Card/);
  assert.match(prompt, /- Others: Uncategorised/);
  assert.doesNotMatch(prompt, /- Income:/);
  assert.match(prompt, /category "Others" and subcategory "Uncategorised"/);
});

test("credit prompt lists only Income and falls back to Others / Uncategorised", () => {
  const prompt = buildSystemPrompt(DEFAULT_CATEGORIES, "credit");
  assert.match(prompt, /- Income: Salary, Personal Savings/);
  assert.doesNotMatch(prompt, /- Food & Groceries:/);
  assert.match(prompt, /category "Others" and subcategory "Uncategorised"/);
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
      { id: 0, category: "food & groceries", subcategory: "snacks" }, // case-insensitive match
      { id: 1, category: "Space Travel", subcategory: "Moon" }, // invented category -> Others / Uncategorised
      { id: 2, category: "Family Support", subcategory: "Bakery" }, // known category, unknown sub -> that category's Others
      { id: 3, category: "Health Care", subcategory: "Spa" }, // no Others in Health Care -> Others / Uncategorised
      { id: 4, category: "Automobile", subcategory: "Wash" }, // no Others in Automobile -> Others / Uncategorised
      { id: 5, category: "Income", subcategory: "Salary" }, // debits can never be Income
      { id: 99, category: "Food & Groceries", subcategory: "Groceries" }, // out of range, ignored
      { id: 0, category: "Health Care", subcategory: "Dental" }, // duplicate id, ignored
    ],
  });

  const out = await classifyBatch(rows, "debit", DEFAULT_CATEGORIES, call);
  assert.deepEqual(out.get(0), { category: "Food & Groceries", subcategory: "Snacks" });
  assert.deepEqual(out.get(1), { category: "Others", subcategory: "Uncategorised" });
  assert.deepEqual(out.get(2), { category: "Family Support", subcategory: "Others" });
  assert.deepEqual(out.get(3), { category: "Others", subcategory: "Uncategorised" });
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
  assert.deepEqual(out.get(1), { category: "Others", subcategory: "Uncategorised" });
  assert.deepEqual(out.get(2), { category: "Others", subcategory: "Uncategorised" });
});

test("a malformed answer is rejected", async () => {
  await assert.rejects(
    () => classifyBatch([row()], "debit", DEFAULT_CATEGORIES, async () => ({ nope: true })),
    /results list/,
  );
});

test("a subcategory's description goes into the prompt next to its name, and others stay plain", () => {
  const categories: CategoryDef[] = [
    {
      category: "Food",
      subcategories: ["Chaats", "Snacks"],
      descriptions: { Chaats: "Dikky poori,\n Panipoori and roadside food" },
    },
  ];
  const debit = buildSystemPrompt(categories, "debit");
  assert.match(debit, /- Food: Chaats \(Dikky poori, Panipoori and roadside food\), Snacks\n/);
  assert.match(debit, /text in brackets/);
  assert.doesNotMatch(buildSystemPrompt([{ category: "Food", subcategories: ["Snacks"] }], "debit"), /Snacks \(/);
});

test("the schema asks for suggestions, and the fallback category is allowed for credits too", async () => {
  const schema = buildSchema(["A"]) as { properties: { results: { items: { required: string[] } } } };
  assert.deepEqual(schema.properties.results.items.required, ["id", "category", "subcategory", "suggestedCategory", "suggestedSubcategory"]);

  let seen: JsonSchema | null = null;
  await classifyBatch([row()], "credit", DEFAULT_CATEGORIES, async (_s, _u, sch) => {
    seen = sch;
    return { results: [{ id: 0, category: "Income", subcategory: "Salary", suggestedCategory: "", suggestedSubcategory: "" }] };
  });
  const enumValues = ((seen as unknown as { properties: { results: { items: { properties: { category: { enum: string[] } } } } } }).properties.results.items.properties.category.enum);
  assert.deepEqual(enumValues, ["Income", "Others"]);
});

test("a suggestion is kept only with the fallback answer, and only when it is usable", async () => {
  const call: LlmCall = async () => ({
    results: [
      // placed: the suggestion is ignored
      { id: 0, category: "Food & Groceries", subcategory: "Snacks", suggestedCategory: "Entertainment", suggestedSubcategory: "Carrom" },
      // not placed, with a suggestion for a new subcategory under an existing category (spelling snaps to the list)
      { id: 1, category: "Others", subcategory: "Uncategorised", suggestedCategory: "entertainment", suggestedSubcategory: "  Carrom  " },
      // not placed, a new category
      { id: 2, category: "Others", subcategory: "Uncategorised", suggestedCategory: "Pets", suggestedSubcategory: "Vet" },
      // unusable suggestions: Income for a debit, the fallback category, empty
      { id: 3, category: "Others", subcategory: "Uncategorised", suggestedCategory: "Income", suggestedSubcategory: "Gift" },
      { id: 4, category: "Others", subcategory: "Uncategorised", suggestedCategory: "Others", suggestedSubcategory: "Misc" },
      { id: 5, category: "Others", subcategory: "Uncategorised", suggestedCategory: "", suggestedSubcategory: "" },
      // missing fields entirely
      { id: 6, category: "Others", subcategory: "Uncategorised" },
    ],
  });
  const out = await classifyBatch(Array.from({ length: 7 }, () => row()), "debit", DEFAULT_CATEGORIES, call);
  assert.equal(out.get(0)?.suggestion, undefined);
  assert.deepEqual(out.get(1), { category: "Others", subcategory: "Uncategorised", suggestion: { category: "Entertainment", subcategory: "Carrom" } });
  assert.deepEqual(out.get(2)?.suggestion, { category: "Pets", subcategory: "Vet" });
  for (const i of [3, 4, 5, 6]) assert.equal(out.get(i)?.suggestion, undefined, `row ${i}`);
});

test("a credit's suggestion always goes under Income", async () => {
  const call: LlmCall = async () => ({
    results: [{ id: 0, category: "Others", subcategory: "Uncategorised", suggestedCategory: "Whatever", suggestedSubcategory: "Cashback" }],
  });
  const out = await classifyBatch([row()], "credit", DEFAULT_CATEGORIES, call);
  assert.deepEqual(out.get(0)?.suggestion, { category: "Income", subcategory: "Cashback" });
});

test("the prompts explain when to suggest", () => {
  assert.match(buildSystemPrompt(DEFAULT_CATEGORIES, "debit"), /suggestedCategory and suggestedSubcategory/);
  assert.match(buildSystemPrompt(DEFAULT_CATEGORIES, "credit"), /suggestedSubcategory/);
});
