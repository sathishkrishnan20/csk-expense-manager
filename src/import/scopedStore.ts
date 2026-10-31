import { scopedKey } from "../domain/groups";
import type { ImportedTransaction, TransactionStore } from "./importStatement";

// A store that works with scoped keys (see scopedKey) and knows which group it writes to.
export interface KeyedStore {
  existingKeys(scopedKeys: string[]): Promise<Set<string>>;
  deletedKeys?(scopedKeys: string[]): Promise<Set<string>>;
  insert(rows: ImportedTransaction[], groupId: string): Promise<void>;
}

// Gives the importer a store for one group. The importer keeps working with the bank's own keys; this
// translates them to scoped keys on the way in and back on the way out.
export function scopeStore(inner: KeyedStore, groupId: string): TransactionStore {
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
  return store;
}
