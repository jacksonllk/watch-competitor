import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).split("\n").filter(Boolean);

// Saved real responses (other sites' text) and private files must never be in the public repo.
describe("repo guard", () => {
  it("tracks nothing under tests/fixtures but its README", () => {
    expect(git("ls-files tests/fixtures").filter((f) => f !== "tests/fixtures/README.md")).toEqual([]);
  });

  it("tracks no private files", () => {
    expect(git("ls-files CLAUDE.md .claude .env .data")).toEqual([]);
  });

  it("ignores the private paths", () => {
    const paths = ["tests/fixtures/local/x.json", "CLAUDE.md", ".claude/x", ".env", ".data/store.json"];
    expect(git(`check-ignore ${paths.join(" ")}`)).toEqual(paths);
  });
});

// The demo's Upstash database is shared with another app. No code may empty it or list its keys.
describe("shared database guard", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|mts|mjs|js)$/.test(name) ? [path] : [];
    });
  }

  const code = () =>
    ["lib", "app", "scripts"]
      .filter((d) => {
        try {
          return statSync(d).isDirectory();
        } catch {
          return false;
        }
      })
      .flatMap(files);

  it("only lib/store/upstash.ts imports the Redis client", () => {
    const importers = code().filter((f) => readFileSync(f, "utf8").includes("@upstash/redis"));
    expect(importers).toEqual([join("lib", "store", "upstash.ts")]);
  });

  it("no code names FLUSHDB or FLUSHALL", () => {
    expect(code().filter((f) => /flushdb|flushall/i.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
