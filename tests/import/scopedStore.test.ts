import { test } from "node:test";
import assert from "node:assert/strict";
import { importStatement, type ImportDeps, type ImportedTransaction } from "../../src/import/importStatement";
import { scopeStore, type KeyedStore } from "../../src/import/scopedStore";

const STATEMENT = [
  "131\t23/10/2026\t23/10/2026\t\tUPI/SATHISH KR/XX20-1@okhdfcb/for dresse/AXIS BANK/629618527541/ICI1\t1355.00\t0.00\t2553.65",
  "134\t25/10/2026\t25/10/2026\t\tNEFT-REFUND-SHOP\t0.00\t500.00\t2699.65",
].join("\n");

// What the SQLite store does, in memory: rows by scoped key, each remembering its group.
class MemoryKeyedStore implements KeyedStore {
  rows = new Map<string, { row: ImportedTransaction; groupId: string }>();
  deleted = new Set<string>();
  async existingKeys(keys: string[]) {
    return new Set(keys.filter((k) => this.rows.has(k)));
  }
  async deletedKeys(keys: string[]) {
    return new Set(keys.filter((k) => this.deleted.has(k)));
  }
  async insert(rows: ImportedTransaction[], groupId: string) {
    for (const row of rows) this.rows.set(row.dedupeKey, { row, groupId });
  }
}

const deps = (store: ImportDeps["store"]): ImportDeps => ({
  store,
  classifierLabel: "test-model",
  classify: async (rows) => new Map(rows.map((_, i) => [i, { category: "Food", subcategory: "Restaurant" }])),
});

test("the same statement imported into Main and into a group makes two sets of rows", async () => {
  const inner = new MemoryKeyedStore();
  const main = await importStatement(STATEMENT, deps(scopeStore(inner, "main")));
  const group = await importStatement(STATEMENT, deps(scopeStore(inner, "g-x")));

  assert.equal(main.imported, 2);
  assert.equal(group.imported, 2);
  assert.deepEqual(
    [...inner.rows.keys()].sort(),
    ["g-x|row:2026-10-25|C|50000|269965|neft-refund-shop", "g-x|upi:629618527541:D", "row:2026-10-25|C|50000|269965|neft-refund-shop", "upi:629618527541:D"].sort(),
  );
  assert.equal(inner.rows.get("upi:629618527541:D")?.groupId, "main");
  assert.equal(inner.rows.get("g-x|upi:629618527541:D")?.groupId, "g-x");
});

test("importing again into the same group skips what is already there", async () => {
  const inner = new MemoryKeyedStore();
  await importStatement(STATEMENT, deps(scopeStore(inner, "g-x")));
  const again = await importStatement(STATEMENT, deps(scopeStore(inner, "g-x")));
  assert.equal(again.imported, 0);
  assert.equal(again.alreadyStored, 2);
  assert.equal(inner.rows.size, 2);
});

test("a row deleted in one group is reported there only", async () => {
  const inner = new MemoryKeyedStore();
  await importStatement(STATEMENT, deps(scopeStore(inner, "g-x")));
  inner.deleted.add("g-x|upi:629618527541:D");

  const sameGroup = await importStatement(STATEMENT, deps(scopeStore(inner, "g-x")));
  assert.deepEqual(sameGroup.deletedEarlier.map((r) => r.dedupeKey), ["upi:629618527541:D"]);

  const main = await importStatement(STATEMENT, deps(scopeStore(inner, "main")));
  assert.equal(main.deletedEarlier.length, 0);
  assert.equal(main.imported, 2);
});

test("sms keys and enrichment go through the group's scoped keys", async () => {
  const seen: { sms: string[]; enriched: string[]; recategorised: string[] } = { sms: [], enriched: [], recategorised: [] };
  const inner: KeyedStore = {
    existingKeys: async (keys) => new Set(keys),
    smsKeys: async (keys) => {
      seen.sms = keys;
      return new Set(keys);
    },
    enrich: async (rows) => {
      seen.enriched = rows.map((r) => r.dedupeKey);
      return { updated: rows.length, aiLabelled: rows };
    },
    recategorise: async (items) => {
      seen.recategorised = items.map((i) => i.dedupeKey);
      return items.length;
    },
    insert: async () => {},
  };
  const row = { dedupeKey: "upi:111122223333:D" } as never;

  const inGroup = scopeStore(inner, "g-x");
  assert.deepEqual([...(await inGroup.smsKeys!(["upi:111122223333:D"]))], ["upi:111122223333:D"]);
  assert.deepEqual(seen.sms, ["g-x|upi:111122223333:D"]);
  const done = await inGroup.enrich!([row]);
  assert.equal(done.updated, 1);
  assert.deepEqual(seen.enriched, ["g-x|upi:111122223333:D"]);
  assert.deepEqual(done.aiLabelled.map((r) => r.dedupeKey), ["upi:111122223333:D"]); // back to the bank's own key
  await inGroup.recategorise!([{ dedupeKey: "upi:111122223333:D", classification: { category: "Food", subcategory: "Groceries" } }], "m");
  assert.deepEqual(seen.recategorised, ["g-x|upi:111122223333:D"]);

  await scopeStore(inner, "main").enrich!([row]);
  assert.deepEqual(seen.enriched, ["upi:111122223333:D"]);
});
