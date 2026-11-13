import type { KvLike } from "../../server/src/worker";

// An in-memory stand-in for Cloudflare KV, with what the Worker uses of it: values with metadata, list by prefix (in key order, as KV does), and a
// time to live that is only recorded (the tests do not wait).
export interface FakeEntry {
  value: string;
  metadata: unknown;
  expirationTtl?: number;
}

export function fakeKv(): KvLike & { data: Map<string, FakeEntry> } {
  const data = new Map<string, FakeEntry>();
  return {
    data,
    get: async (key) => data.get(key)?.value ?? null,
    getWithMetadata: async <M>(key: string) => {
      const entry = data.get(key);
      return { value: entry?.value ?? null, metadata: (entry?.metadata as M | undefined) ?? null };
    },
    put: async (key, value, options) => void data.set(key, { value, metadata: options?.metadata, expirationTtl: options?.expirationTtl }),
    delete: async (key) => void data.delete(key),
    list: async ({ prefix }) => ({
      keys: [...data.entries()]
        .filter(([name]) => name.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, entry]) => ({ name, metadata: entry.metadata })),
    }),
  };
}
