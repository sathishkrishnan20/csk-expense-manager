import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type ImportedTransaction, type TransactionStore } from "../../src/import/importStatement";
import type { ParsedTransaction } from "../../src/domain/statementParser";
import { parseBankSms, smsToParsed } from "../../src/domain/smsParser";
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

// A store that also knows which of its rows came from a bank SMS, and fills them in from the statement the way the SQLite store does.
class SmsAwareStore extends MemoryStore {
  async smsKeys(keys: string[]) {
    return new Set(keys.filter((k) => this.rows.has(k) && this.rows.get(k)!.balancePaise === null && this.rows.get(k)!.narration === ""));
  }
  async enrich(rows: ParsedTransaction[]) {
    const aiLabelled: ParsedTransaction[] = [];
    for (const r of rows) {
      const stored = this.rows.get(r.dedupeKey)!;
      if (stored.classifiedBy !== "manual") aiLabelled.push(r);
      const startsWith = r.payee !== null && stored.payee !== null && r.payee.toLowerCase().startsWith(stored.payee.toLowerCase());
      this.rows.set(r.dedupeKey, {
        ...stored,
        balancePaise: r.balancePaise,
        narration: r.narration,
        note: r.note,
        payee: !stored.payee || startsWith ? (r.payee ?? stored.payee) : stored.payee,
        description: stored.description || r.note,
      });
    }
    return { updated: rows.length, aiLabelled };
  }
  async recategorise(items: { dedupeKey: string; classification: Classification }[], label: string) {
    let changed = 0;
    for (const { dedupeKey, classification } of items) {
      const stored = this.rows.get(dedupeKey);
      if (!stored || stored.classifiedBy === "manual") continue;
      this.rows.set(dedupeKey, { ...stored, ...classification, classifiedBy: label });
      changed++;
    }
    return changed;
  }
}

const SMS = "ICICI Bank Acct XX236 debited for Rs 1355.00 on 23-Oct-26; SATHISH K credited. UPI:629618527541. Call 18002662 for dispute.";

test("a statement fills in an entry that came from a bank SMS, and keeps its category", async () => {
  const store = new SmsAwareStore();
  const deps = { store, classifierLabel: "test-model", classify: classifyByDirection };

  // The SMS arrives first: a row with a cut-short payee and nothing else. The owner then sets its category by hand.
  const fromSms = smsToParsed(parseBankSms(SMS, new Date(2026, 9, 23))!);
  const first = await (await import("../../src/import/importStatement")).importParsed({ rows: [fromSms], skippedLines: 0 }, deps);
  assert.equal(first.imported, 1);
  assert.equal(store.rows.get("upi:629618527541:D")?.paymentMethod, "UPI");
  store.rows.set("upi:629618527541:D", { ...store.rows.get("upi:629618527541:D")!, category: "Personal", subcategory: "Clothing", classifiedBy: "manual" });

  const summary = await importStatement(STATEMENT, deps);
  assert.equal(summary.imported, 3); // the other three rows
  assert.equal(summary.alreadyStored, 1);
  assert.equal(summary.enriched, 1);

  const row = store.rows.get("upi:629618527541:D")!;
  assert.equal(row.payee, "SATHISH KR"); // the full payee replaces the cut-short one
  assert.equal(row.balancePaise, 255365);
  assert.match(row.narration, /^UPI\/SATHISH KR/);
  assert.equal(row.note, "for dresse");
  assert.deepEqual([row.category, row.subcategory, row.classifiedBy], ["Personal", "Clothing", "manual"]);

  // Importing the same statement again changes nothing more: the entry is no longer SMS-only.
  assert.equal((await importStatement(STATEMENT, deps)).enriched, 0);
});

test("a payee the owner typed over is not replaced, and a deleted SMS entry is not brought back", async () => {
  const store = new SmsAwareStore();
  const deps = { store, classifierLabel: "test-model", classify: classifyByDirection };
  const { importParsed } = await import("../../src/import/importStatement");
  await importParsed({ rows: [smsToParsed(parseBankSms(SMS, new Date(2026, 9, 23))!)], skippedLines: 0 }, deps);
  store.rows.set("upi:629618527541:D", { ...store.rows.get("upi:629618527541:D")!, payee: "Dress shop" });

  await importStatement(STATEMENT, deps);
  assert.equal(store.rows.get("upi:629618527541:D")?.payee, "Dress shop");

  const store2 = new SmsAwareStore();
  const deps2 = { store: store2, classifierLabel: "test-model", classify: classifyByDirection };
  await importParsed({ rows: [smsToParsed(parseBankSms(SMS, new Date(2026, 9, 23))!)], skippedLines: 0 }, deps2);
  store2.deleted.add("upi:629618527541:D");
  const summary = await importStatement(STATEMENT, deps2);
  assert.equal(summary.enriched, 0);
  assert.equal(summary.deletedEarlier.length, 1);
});

test("an SMS entry the AI categorised is categorised again with the statement's note; a hand-chosen category is kept", async () => {
  const { importParsed } = await import("../../src/import/importStatement");
  const seen: string[] = [];
  const answers = new Map<string, Classification>([["for dresse", { category: "Personal", subcategory: "Clothing" }]]);
  const classify = async (rows: ParsedTransaction[], direction: Direction) => {
    // The first call is for the SMS row, which has no note; the second is the second look, with the statement's note.
    seen.push(...rows.map((r) => r.note ?? "(no note)"));
    return new Map<number, Classification>(rows.map((r, i) => [i, answers.get(r.note ?? "") ?? { category: "Others", subcategory: "Uncategorised" }]));
  };

  const store = new SmsAwareStore();
  const deps = { store, classifierLabel: "test-model", classify };
  await importParsed({ rows: [smsToParsed(parseBankSms(SMS, new Date(2026, 9, 23))!)], skippedLines: 0 }, deps);
  assert.deepEqual(store.rows.get("upi:629618527541:D")?.category, "Others"); // the SMS alone told the AI too little

  const summary = await importStatement(STATEMENT, deps);
  assert.equal(summary.enriched, 1);
  assert.equal(summary.recategorised, 1);
  assert.ok(seen.includes("for dresse"));
  const row = store.rows.get("upi:629618527541:D")!;
  assert.deepEqual([row.category, row.subcategory, row.classifiedBy], ["Personal", "Clothing", "test-model"]);

  // One the owner categorised by hand is not asked about again.
  const handStore = new SmsAwareStore();
  const handDeps = { store: handStore, classifierLabel: "test-model", classify };
  await importParsed({ rows: [smsToParsed(parseBankSms(SMS, new Date(2026, 9, 23))!)], skippedLines: 0 }, handDeps);
  handStore.rows.set("upi:629618527541:D", { ...handStore.rows.get("upi:629618527541:D")!, category: "Gifts", subcategory: "Family", classifiedBy: "manual" });
  const kept = await importStatement(STATEMENT, handDeps);
  assert.equal(kept.recategorised, 0);
  assert.deepEqual([handStore.rows.get("upi:629618527541:D")?.category, handStore.rows.get("upi:629618527541:D")?.subcategory], ["Gifts", "Family"]);
});

test("if the second look gives no real category or fails, the entry keeps the category it has", async () => {
  const { importParsed } = await import("../../src/import/importStatement");
  const make = async (second: (rows: ParsedTransaction[]) => Promise<Map<number, Classification>>) => {
    const store = new SmsAwareStore();
    let calls = 0;
    const classify = async (rows: ParsedTransaction[]) => {
      calls++;
      // Call 1 saves the SMS entry; call 2 is the second look at it (before the statement's new rows are categorised); later calls are those rows.
      return calls === 2 ? second(rows) : new Map<number, Classification>(rows.map((_, i) => [i, { category: "Food", subcategory: "Groceries" }]));
    };
    const deps = { store, classifierLabel: "test-model", classify };
    await importParsed({ rows: [smsToParsed(parseBankSms(SMS, new Date(2026, 9, 23))!)], skippedLines: 0 }, deps);
    const summary = await importStatement(STATEMENT, deps);
    return { summary, row: store.rows.get("upi:629618527541:D")! };
  };

  const fallback = await make(async (rows) => new Map(rows.map((_, i) => [i, { category: "Others", subcategory: "Uncategorised" }])));
  assert.equal(fallback.summary.recategorised, 0);
  assert.equal(fallback.row.category, "Food");

  const failed = await make(async () => {
    throw new Error("quota");
  });
  assert.equal(failed.summary.enriched, 1); // the statement's details were still filled in
  assert.equal(failed.summary.recategorised, 0);
  assert.equal(failed.summary.error, null);
  assert.equal(failed.row.category, "Food");
});
