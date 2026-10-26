import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type ImportedTransaction, type TransactionStore } from "../../src/import/importStatement";
import type { ParsedTransaction } from "../../src/domain/statementParser";
import type { Classification, Direction } from "../../src/domain/taxonomy";

const STATEMENT = [
  "131\t23/10/2026\t23/10/2026\t\tUPI/SATHISH KR/XX20-1@okhdfcb/for dresse/AXIS BANK/629618527541/ICI1\t1355.00\t0.00\t2553.65",
  "132\t23/10/2026\t23/10/2026\t\tUPI/SRINIVAS V/XXx3im@ptys/UPI/YES BANK L/629682828654/ICI2\t75.00\t0.00\t2478.65",
  "133\t24/10/2026\t24/10/2026\t\tUPI/Raghavendr/XX1685@ybl/pampers/YES BANK L/629788882794/ICI3\t279.00\t0.00\t2199.65",
  "134\t25/10/2026\t25/10/2026\t\tNEFT-REFUND-SHOP\t0.00\t500.00\t2699.65",
].join("\n");

class MemoryStore implements TransactionStore {
  rows = new Map<string, ImportedTransaction>();
  deleted = new Set<string>();
  async existingKeys(keys: string[]) {
    return new Set(keys.filter((k) => this.rows.has(k)));
  }
  async deletedKeys(keys: string[]) {
    return new Set(keys.filter((k) => this.deleted.has(k)));
  }
  async insert(rows: ImportedTransaction[]) {
    for (const r of rows) this.rows.set(r.dedupeKey, r);
  }
}

const classifyByDirection = async (rows: ParsedTransaction[], direction: Direction) =>
  new Map<number, Classification>(
    rows.map((_, i) => [
      i,
      direction === "credit"
        ? { category: "Income", subcategory: "Others" }
        : { category: "Food", subcategory: "Restaurant" },
    ]),
  );

test("classifies debits and credits separately and fills payment method and description", async () => {
  const store = new MemoryStore();
  const calls: [Direction, number][] = [];
  const summary = await importStatement(STATEMENT, {
    store,
    classifierLabel: "test-model",
    classify: async (rows, direction) => {
      calls.push([direction, rows.length]);
      return classifyByDirection(rows, direction);
    },
  });

  assert.equal(summary.parsed, 4);
  assert.equal(summary.imported, 4);
  assert.deepEqual(calls, [
    ["debit", 3],
    ["credit", 1],
  ]);

  const dress = store.rows.get("upi:629618527541:D");
  assert.equal(dress?.category, "Food");
  assert.equal(dress?.classifiedBy, "test-model");
  assert.equal(dress?.paymentMethod, "UPI");
  assert.equal(dress?.description, "for dresse");

  const noNote = store.rows.get("upi:629682828654:D");
  assert.equal(noNote?.description, null);

  const credit = [...store.rows.values()].find((r) => r.direction === "credit");
  assert.deepEqual([credit?.category, credit?.subcategory, credit?.paymentMethod], ["Income", "Others", null]);
});

test("uploading the same statement again skips everything and never calls the model", async () => {
  const store = new MemoryStore();
  const deps = { store, classifierLabel: "m", classify: classifyByDirection };
  await importStatement(STATEMENT, deps);

  let called = false;
  const second = await importStatement(STATEMENT, {
    ...deps,
    classify: async (rows, direction) => {
      called = true;
      return classifyByDirection(rows, direction);
    },
  });

  assert.equal(called, false);
  assert.equal(second.alreadyStored, 4);
  assert.equal(second.imported, 0);
  assert.equal(store.rows.size, 4);
});

test("an overlapping statement only classifies the new rows", async () => {
  const store = new MemoryStore();
  const lines = STATEMENT.split("\n");
  const deps = { store, classifierLabel: "m", classify: classifyByDirection };
  await importStatement(lines.slice(0, 2).join("\n"), deps);

  const seen: string[] = [];
  const summary = await importStatement(STATEMENT, {
    ...deps,
    classify: async (rows, direction) => {
      seen.push(...rows.map((r) => r.upiRef ?? r.narration));
      return classifyByDirection(rows, direction);
    },
  });

  assert.deepEqual(seen, ["629788882794", "NEFT-REFUND-SHOP"]);
  assert.equal(summary.alreadyStored, 2);
  assert.equal(summary.imported, 2);
});

test("duplicate rows inside one file are counted once", async () => {
  const store = new MemoryStore();
  const line = STATEMENT.split("\n")[0];
  const summary = await importStatement(`${line}\n${line}`, {
    store,
    classifierLabel: "m",
    classify: classifyByDirection,
  });
  assert.equal(summary.duplicatesInFile, 1);
  assert.equal(store.rows.size, 1);
});

test("a failed batch stops the import, counts later rows as not saved, and a re-upload resumes", async () => {
  const store = new MemoryStore();
  let calls = 0;
  const flaky = async (rows: ParsedTransaction[], direction: Direction) => {
    calls++;
    if (calls === 2) throw new Error("quota exceeded");
    return classifyByDirection(rows, direction);
  };

  const first = await importStatement(STATEMENT, { store, classifierLabel: "m", classify: flaky, batchSize: 1 });
  assert.equal(first.error, "quota exceeded");
  assert.equal(first.imported, 1);
  assert.equal(first.notSaved, 3); // 2 remaining debits + the credit that was never reached
  assert.equal(store.rows.size, 1);

  const second = await importStatement(STATEMENT, {
    store,
    classifierLabel: "m",
    classify: classifyByDirection,
    batchSize: 1,
  });
  assert.equal(second.error, null);
  assert.equal(second.alreadyStored, 1);
  assert.equal(second.imported, 3);
  assert.equal(store.rows.size, 4);
});

test("rows the model forgot to return are not saved", async () => {
  const store = new MemoryStore();
  const summary = await importStatement(STATEMENT, {
    store,
    classifierLabel: "m",
    classify: async (_rows, direction) =>
      new Map<number, Classification>(
        direction === "debit" ? [[0, { category: "Food", subcategory: "Groceries" }]] : [],
      ),
  });
  assert.equal(summary.imported, 1);
  assert.equal(summary.notSaved, 3);
});

test("rows the owner deleted earlier are not added again, but are reported so they can be restored", async () => {
  const store = new MemoryStore();
  await importStatement(STATEMENT, { store, classifierLabel: "m", classify: classifyByDirection });
  store.deleted.add("upi:629618527541:D");
  store.deleted.add("upi:629682828654:D");

  const again = await importStatement(STATEMENT, { store, classifierLabel: "m", classify: classifyByDirection });
  assert.equal(again.imported, 0);
  assert.equal(again.alreadyStored, 2); // the two still there
  assert.deepEqual(again.deletedEarlier.map((r) => [r.dedupeKey, r.payee, r.amountPaise]), [
    ["upi:629618527541:D", "SATHISH KR", 135500],
    ["upi:629682828654:D", "SRINIVAS V", 7500],
  ]);
  assert.equal(store.rows.size, 4);
});
