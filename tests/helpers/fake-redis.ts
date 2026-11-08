import type { RedisLike } from "@/lib/store/upstash";

/** Offline stand-in for the Upstash client. Records every key it is called with. */
export function createFakeRedis() {
  const data = new Map<string, { value: string; expiresAt: number | null }>();
  const keys: string[] = [];

  const redis: RedisLike = {
    async get(key) {
      keys.push(key);
      const entry = data.get(key);
      if (!entry || (entry.expiresAt !== null && entry.expiresAt <= Date.now())) return null;
      return entry.value;
    },
    async set(key, value, options) {
      keys.push(key);
      if (typeof value !== "string") throw new Error("fake redis: value must be a string");
      data.set(key, { value, expiresAt: options ? Date.now() + options.ex * 1000 : null });
      return "OK";
    },
    async del(key) {
      keys.push(key);
      return data.delete(key) ? 1 : 0;
    },
  };
  return { redis, keys };
}
