import { expiresAt, prefixed, type Store } from "./types";

type Entry = { json: string; expiresAt: number | null };

/** In-memory store for tests. Values are copied through JSON so callers cannot change saved data. */
export function createMemoryStore(): Store {
  const entries = new Map<string, Entry>();

  return {
    async get<T>(key: string) {
      const entry = entries.get(prefixed(key));
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        entries.delete(prefixed(key));
        return null;
      }
      return JSON.parse(entry.json) as T;
    },
    async set(key, value, options) {
      entries.set(prefixed(key), {
        json: JSON.stringify(value),
        expiresAt: expiresAt(Date.now(), options?.ttlSeconds),
      });
    },
    async delete(key) {
      entries.delete(prefixed(key));
    },
  };
}
