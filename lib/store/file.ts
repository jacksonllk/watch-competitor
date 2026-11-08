import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expiresAt, prefixed, type Store } from "./types";

type Entry = { value: unknown; expiresAt: number | null };
type Data = Record<string, Entry>;

/**
 * Store in one JSON file, for self-hosting on a server with a disk.
 * Writes go one at a time and replace the file in one step, so a crash never leaves half a file.
 */
export function createFileStore(path: string): Store {
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Data> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async function save(data: Data) {
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(data, null, 2));
    await rename(temp, path);
  }

  /** Runs read-modify-write steps one after another, so two writes never overwrite each other. */
  function update(change: (data: Data) => void): Promise<void> {
    const next = queue.then(async () => {
      const data = await load();
      change(data);
      await save(data);
    });
    queue = next.catch(() => {});
    return next;
  }

  return {
    async get<T>(key: string) {
      await queue;
      const entry = (await load())[prefixed(key)];
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) return null;
      return entry.value as T;
    },
    async set(key, value, options) {
      const entry: Entry = {
        value: JSON.parse(JSON.stringify(value)),
        expiresAt: expiresAt(Date.now(), options?.ttlSeconds),
      };
      return update((data) => {
        data[prefixed(key)] = entry;
        // Drop expired entries on each write so the file does not grow forever.
        for (const [k, e] of Object.entries(data)) {
          if (e.expiresAt !== null && e.expiresAt <= Date.now()) delete data[k];
        }
      });
    },
    async delete(key) {
      return update((data) => {
        delete data[prefixed(key)];
      });
    },
  };
}
