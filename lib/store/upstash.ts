import { Redis } from "@upstash/redis";
import { checkTtl, prefixed, type Store } from "./types";

/** The three Redis commands this adapter uses. Nothing else, so it can never touch keys outside the prefix. */
export type RedisLike = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, options?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

/**
 * Store on Upstash Redis over REST.
 * The demo database is shared with another app: every key gets the `competitor-watch:` prefix,
 * and the adapter only reads, writes and deletes one exact key at a time.
 * Values are saved as JSON text and parsed here, so a string such as "123" comes back as a string.
 */
export function createUpstashStore(redis: RedisLike): Store {
  return {
    async get<T>(key: string) {
      const raw = await redis.get(prefixed(key));
      if (raw === null || raw === undefined) return null;
      return JSON.parse(String(raw)) as T;
    },
    async set(key, value, options) {
      const json = JSON.stringify(value);
      const ttl = options?.ttlSeconds;
      checkTtl(ttl);
      if (ttl === undefined) await redis.set(prefixed(key), json);
      else await redis.set(prefixed(key), json, { ex: ttl });
    },
    async delete(key) {
      await redis.del(prefixed(key));
    },
  };
}

/**
 * Upstash client from UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * (or KV_REST_API_URL and KV_REST_API_TOKEN, set by the Vercel Marketplace).
 * Automatic JSON parsing is off: the adapter parses values itself.
 */
export function upstashFromEnv(): RedisLike {
  return Redis.fromEnv({ automaticDeserialization: false }) as unknown as RedisLike;
}
