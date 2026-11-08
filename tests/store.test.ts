import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createFileStore } from "@/lib/store/file";
import { createMemoryStore } from "@/lib/store/memory";
import { KEY_PREFIX, type Store } from "@/lib/store/types";
import { createUpstashStore, upstashFromEnv } from "@/lib/store/upstash";
import { createFakeRedis } from "./helpers/fake-redis";

const tempDirs: string[] = [];
afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

async function fileStore(): Promise<Store> {
  const dir = await mkdtemp(join(tmpdir(), "cw-store-"));
  tempDirs.push(dir);
  return createFileStore(join(dir, "store.json"));
}

// The live Upstash run is opt-in: the demo database is shared with another app.
// It writes only keys under competitor-watch:test:<run id>: and deletes only those.
const liveUpstash = process.env.STORE_TEST_UPSTASH === "1";

const adapters: Array<[string, () => Promise<Store>]> = [
  ["memory", async () => createMemoryStore()],
  ["file", fileStore],
  ["upstash (offline fake)", async () => createUpstashStore(createFakeRedis().redis)],
];
if (liveUpstash) adapters.push(["upstash (live)", async () => createUpstashStore(upstashFromEnv())]);

const run = `test:${randomUUID()}:`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(adapters)("Store adapter: %s", (_name, make) => {
  it("returns null for a missing key", async () => {
    const store = await make();
    expect(await store.get(`${run}missing`)).toBeNull();
  });

  it("saves and returns objects, numbers and strings unchanged", async () => {
    const store = await make();
    const value = { name: "Acme Notes", news: [{ title: "Seed round", at: 1762214400000 }], ok: true };
    await store.set(`${run}obj`, value);
    await store.set(`${run}num`, 42);
    await store.set(`${run}str`, "123");
    expect(await store.get(`${run}obj`)).toEqual(value);
    expect(await store.get(`${run}num`)).toBe(42);
    expect(await store.get(`${run}str`)).toBe("123");
    for (const k of ["obj", "num", "str"]) await store.delete(`${run}${k}`);
  });

  it("overwrites a key", async () => {
    const store = await make();
    await store.set(`${run}cursor`, "2026-11-01T00:00:00Z");
    await store.set(`${run}cursor`, "2026-11-08T00:00:00Z");
    expect(await store.get(`${run}cursor`)).toBe("2026-11-08T00:00:00Z");
    await store.delete(`${run}cursor`);
  });

  it("deletes a key, and deleting a missing key is not an error", async () => {
    const store = await make();
    await store.set(`${run}gone`, 1);
    await store.delete(`${run}gone`);
    expect(await store.get(`${run}gone`)).toBeNull();
    await expect(store.delete(`${run}never-set`)).resolves.toBeUndefined();
  });

  it("expires a key after ttlSeconds and keeps one without", async () => {
    const store = await make();
    await store.set(`${run}short`, "cached", { ttlSeconds: 1 });
    await store.set(`${run}kept`, "kept");
    expect(await store.get(`${run}short`)).toBe("cached");
    await wait(1200);
    expect(await store.get(`${run}short`)).toBeNull();
    expect(await store.get(`${run}kept`)).toBe("kept");
    await store.delete(`${run}kept`);
  });

  it("rejects an empty key and a ttl under one second", async () => {
    const store = await make();
    await expect(store.set("", 1)).rejects.toThrow();
    await expect(store.set(`${run}bad`, 1, { ttlSeconds: 0.5 })).rejects.toThrow();
  });
});

describe("key prefix", () => {
  it("Upstash adapter sends only keys under competitor-watch:", async () => {
    const { redis, keys } = createFakeRedis();
    const store = createUpstashStore(redis);
    await store.set("alerts:cursor", "x", { ttlSeconds: 60 });
    await store.get("alerts:cursor");
    await store.delete("alerts:cursor");
    expect(keys).toEqual(Array(3).fill("competitor-watch:alerts:cursor"));
    expect(KEY_PREFIX).toBe("competitor-watch:");
  });

  it("file adapter writes keys under competitor-watch:", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cw-store-"));
    tempDirs.push(dir);
    const path = join(dir, "store.json");
    await createFileStore(path).set("alerts:cursor", "x");
    expect(Object.keys(JSON.parse(await readFile(path, "utf8")))).toEqual(["competitor-watch:alerts:cursor"]);
  });

  it("file adapter keeps every write when several run at once", async () => {
    const store = await fileStore();
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.set(`k${i}`, i)));
    for (let i = 0; i < 20; i++) expect(await store.get(`k${i}`)).toBe(i);
  });
});
