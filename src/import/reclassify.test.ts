import { test } from "node:test";
import assert from "node:assert/strict";
import { reclassify, type ReclassifyCandidate } from "./reclassify";
import type { Classification, Direction } from "../domain/taxonomy";

const cand = (id: string, direction: Direction = "debit"): ReclassifyCandidate => ({
  id,
  direction,
  amountPaise: 10000,
  payee: "X",
  vpa: null,
  note: null,
  narration: "UPI/X",
});

const applied: { id: string; classification: Classification }[] = [];
const deps = (rows: ReclassifyCandidate[], answer: (c: ReclassifyCandidate) => Classification | null, extra = {}) => {
  applied.length = 0;
  return {
    list: async () => rows,
    apply: async (u: { id: string; classification: Classification }[]) => void applied.push(...u),
    classify: async (batch: ReclassifyCandidate[]) =>
      new Map<number, Classification>(
        batch.flatMap((c, i) => {
          const a = answer(c);
          return a ? [[i, a] as [number, Classification]] : [];
        }),
      ),
    ...extra,
  };
};

test("rows that now fit a category are moved; rows that still do not stay uncategorised", async () => {
  const rows = [cand("a"), cand("b"), cand("c", "credit")];
  const summary = await reclassify(
    deps(rows, (c) =>
      c.id === "a"
        ? { category: "Pets", subcategory: "Vet" }
        : c.id === "b"
          ? { category: "Others", subcategory: "Uncategorised" }
          : { category: "Income", subcategory: "Salary" },
    ),
  );
  assert.deepEqual(summary, { total: 3, moved: 2, stillUncategorised: 1, notProcessed: 0, error: null });
  assert.equal(applied.length, 3);
});

test("a credit that stays Income / Others counts as uncategorised", async () => {
  const summary = await reclassify(deps([cand("c", "credit")], () => ({ category: "Income", subcategory: "Others" })));
  assert.equal(summary.stillUncategorised, 1);
  assert.equal(summary.moved, 0);
});

test("a failure stops the run and reports how many were not processed", async () => {
  const rows = [cand("a"), cand("b"), cand("c", "credit")];
  let calls = 0;
  const summary = await reclassify({
    ...deps(rows, () => ({ category: "Food", subcategory: "Snacks" })),
    batchSize: 1,
    classify: async (batch) => {
      if (++calls === 2) throw new Error("quota exceeded");
      return new Map<number, Classification>(batch.map((_, i) => [i, { category: "Food", subcategory: "Snacks" }]));
    },
  });
  assert.equal(summary.error, "quota exceeded");
  assert.equal(summary.moved, 1);
  assert.equal(summary.notProcessed, 2);
});

test("rows the model did not return are left alone", async () => {
  const summary = await reclassify(deps([cand("a"), cand("b")], (c) => (c.id === "a" ? { category: "Food", subcategory: "Snacks" } : null)));
  assert.equal(summary.moved, 1);
  assert.equal(summary.notProcessed, 1);
  assert.deepEqual(applied.map((u) => u.id), ["a"]);
});

test("nothing to do", async () => {
  const summary = await reclassify(deps([], () => null));
  assert.deepEqual(summary, { total: 0, moved: 0, stillUncategorised: 0, notProcessed: 0, error: null });
});
