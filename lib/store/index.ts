/**
 * Picks the store. Upstash when its variables are set. Otherwise the file `.data/store.json`,
 * except on a serverless host, which keeps no files between requests: there the app shows one setup step.
 */
import { join } from "node:path";
import { createFileStore } from "./file";
import type { Store } from "./types";
import { createUpstashStore, upstashFromEnv } from "./upstash";

export type StoreChoice = { kind: "upstash" | "file"; store: Store } | { kind: "missing"; store: null };

type Env = Record<string, string | undefined>;

export function chooseStore(env: Env = process.env, cwd: string = process.cwd()): StoreChoice {
  const hasUpstash =
    (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) || (env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
  if (hasUpstash) return { kind: "upstash", store: createUpstashStore(upstashFromEnv()) };
  // Serverless hosts keep no files between requests. VERCEL is one such host's marker; add others here as they come up.
  if (env.VERCEL) return { kind: "missing", store: null };
  return { kind: "file", store: createFileStore(join(cwd, ".data", "store.json")) };
}

let cached: StoreChoice | null = null;

/** The store for this server process. */
export function getStore(): StoreChoice {
  cached ??= chooseStore();
  return cached;
}
