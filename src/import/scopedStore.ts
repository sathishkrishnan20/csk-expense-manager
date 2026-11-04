import { scopedKey } from "../domain/groups";
import type { ParsedTransaction } from "../domain/statementParser";
import type { Classification } from "../domain/taxonomy";
import type { TransactionSource } from "../domain/transactionSource";
import type { ImportedTransaction, TransactionStore } from "./importStatement";

// A store that works with scoped keys (see scopedKey) and knows which group it writes to.
export interface KeyedStore {
  existingKeys(scopedKeys: string[]): Promise<Set<string>>;
  deletedKeys?(scopedKeys: string[]): Promise<Set<string>>;
  smsKeys?(scopedKeys: string[]): Promise<Set<string>>;
  enrich?(rows: ParsedTransaction[]): Promise<{ updated: number; aiLabelled: ParsedTransaction[] }>;
  recategorise?(items: { dedupeKey: string; classification: Classification }[], label: string): Promise<number>;
  insert(rows: ImportedTransaction[], groupId: string, source: TransactionSource): Promise<void>;
}

// Gives the importer a store for one group. The importer keeps working with the bank's own keys; this
// translates them to scoped keys on the way in and back on the way out. `source` is how the rows it inserts came in (a statement
// import by default, "sms" for the automatic bank SMS route); it is written only when a row is first inserted.
export function scopeStore(inner: KeyedStore, groupId: string, source: TransactionSource = "import"): TransactionStore {
  const toScoped = (keys: string[]) => new Map(keys.map((k) => [scopedKey(groupId, k), k]));
  const fromScoped = (found: Set<string>, map: Map<string, string>) =>
    new Set([...found].map((s) => map.get(s)).filter((k): k is string => k !== undefined));

  const store: TransactionStore = {
    async existingKeys(keys) {
      const map = toScoped(keys);
      return fromScoped(await inner.existingKeys([...map.keys()]), map);
    },
    async insert(rows) {
      await inner.insert(
        rows.map((r) => ({ ...r, dedupeKey: scopedKey(groupId, r.dedupeKey) })),
        groupId,
        source,
      );
    },
  };
  if (inner.deletedKeys) {
    const deletedKeys = inner.deletedKeys.bind(inner);
    store.deletedKeys = async (keys) => {
      const map = toScoped(keys);
      return fromScoped(await deletedKeys([...map.keys()]), map);
    };
  }
  if (inner.smsKeys) {
    const smsKeys = inner.smsKeys.bind(inner);
    store.smsKeys = async (keys) => {
      const map = toScoped(keys);
      return fromScoped(await smsKeys([...map.keys()]), map);
    };
  }
  if (inner.enrich) {
    const enrich = inner.enrich.bind(inner);
    store.enrich = async (rows) => {
      const scoped = rows.map((r) => ({ ...r, dedupeKey: scopedKey(groupId, r.dedupeKey) }));
      const original = new Map(scoped.map((r, i) => [r.dedupeKey, rows[i]]));
      const done = await enrich(scoped);
      return { updated: done.updated, aiLabelled: done.aiLabelled.map((r) => original.get(r.dedupeKey) ?? r) };
    };
  }
  if (inner.recategorise) {
    const recategorise = inner.recategorise.bind(inner);
    store.recategorise = (items, label) =>
      recategorise(items.map((i) => ({ ...i, dedupeKey: scopedKey(groupId, i.dedupeKey) })), label);
  }
  return store;
}
