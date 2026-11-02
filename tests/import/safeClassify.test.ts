import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOrFallback } from "../../src/import/safeClassify";
import type { ParsedTransaction } from "../../src/domain/statementParser";
import type { Classification } from "../../src/domain/taxonomy";

const rows = [{}, {}, {}] as ParsedTransaction[];
const UNCATEGORISED = { category: "Others", subcategory: "Uncategorised" };

test("the AI's answers are passed through when it works", async () => {
  const answers = new Map<number, Classification>([[0, { category: "Food", subcategory: "Groceries" }]]);
  const problems: string[] = [];
  const classify = classifyOrFallback(async () => answers, (r) => problems.push(r));
  assert.equal(await classify(rows, "debit"), answers);
  assert.deepEqual(problems, []);
});

test("when the AI fails every row still gets an answer, Uncategorised, and the reason is reported", async () => {
  const problems: string[] = [];
  const classify = classifyOrFallback(async () => {
    throw new Error("quota exceeded");
  }, (r) => problems.push(r));
  const out = await classify(rows, "debit");
  assert.deepEqual([...out.entries()], [[0, UNCATEGORISED], [1, UNCATEGORISED], [2, UNCATEGORISED]]);
  assert.deepEqual(problems, ["quota exceeded"]);
});

test("with no AI at all (no key) every row is Uncategorised and nothing is reported as a call failure", async () => {
  const problems: string[] = [];
  const out = await classifyOrFallback(null, (r) => problems.push(r))(rows, "credit");
  assert.equal(out.size, 3);
  assert.deepEqual(out.get(1), UNCATEGORISED);
  assert.deepEqual(problems, []);
});
