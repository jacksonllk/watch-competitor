import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { focusWords, readChangelog } from "@/lib/changelog-history";

const range = { from: "2026-08-11T00:00:00.000Z", to: "2026-11-09T01:45:00.000Z" };

describe("readChangelog on made-up pages in the three layouts", () => {
  it("drops housekeeping entries, like the changelog monitor does", () => {
    const md =
      "1. [October 5, 2026 x\\\\ \\\\ **Release branch sync and dependency updates**\\\\ \\\\ Chores.](https://a.example/1)\n2. [October 6, 2026 x\\\\ \\\\ **GPU sandboxes**\\\\ \\\\ New.](https://a.example/2)";
    expect(readChangelog(md, "https://a.example/", range).map((e) => e.title)).toEqual(["GPU sandboxes"]);
  });

  it("reads a dated list with bold titles", () => {
    const md =
      "1. [October 27, 2026 October 27, 2026 Oct 27 2026\\\\ \\\\ **Exit Snapshots for Sandboxes**\\\\ \\\\ Take a snapshot on exit.](https://acme.example/changelog#exit)";
    expect(readChangelog(md, "https://acme.example/changelog", range)).toMatchObject([
      {
        date: "2026-10-27T12:00:00.000Z",
        title: "Exit Snapshots for Sandboxes",
        summary: "Take a snapshot on exit.",
        url: "https://acme.example/changelog#exit",
      },
    ]);
  });

  it("reads dated blocks", () => {
    const md = "OCT 12 2026 OCT 12 2026\n\n[**GPU sandboxes**](/changelog/gpu)\n\nV1.2.0\n\n- GPU\n\nSandboxes can now use GPUs.\n";
    expect(readChangelog(md, "https://acme.example/changelog", range)).toMatchObject([
      { date: "2026-10-12T12:00:00.000Z", title: "GPU sandboxes", summary: "Sandboxes can now use GPUs.", url: "https://acme.example/changelog/gpu" },
    ]);
  });

  it("reads month headings with entries", () => {
    const md = "### Oct\n\n2026\n\n- [Oct 26DNS AllowlistsThis week you can pick DNS servers.](https://docs.acme.example/changelog#oct-26)\n";
    expect(readChangelog(md, "https://acme.example/changelog", range)).toMatchObject([
      { date: "2026-10-26T12:00:00.000Z", title: "DNS Allowlists", summary: "This week you can pick DNS servers." },
    ]);
  });

  it("keeps the 90 days before adding, and follows the focus", () => {
    const md =
      "1. [July 1, 2026 x\\\\ \\\\ **Old**\\\\ \\\\ Old.](https://a.example/1)\n2. [October 1, 2026 x\\\\ \\\\ **New model**\\\\ \\\\ A model.](https://a.example/2)\n3. [October 2, 2026 x\\\\ \\\\ **Sandbox sidecars**\\\\ \\\\ Isolation.](https://a.example/3)";
    expect(readChangelog(md, "https://a.example/", range).map((e) => e.title)).toEqual(["Sandbox sidecars", "New model"]);
    expect(
      readChangelog(md, "https://a.example/", { ...range, focus: focusWords("Only report changes about sandboxes.") }).map((e) => e.title),
    ).toEqual(["Sandbox sidecars"]);
  });
});

// Saved real pages (tests/fixtures/local, git-ignored). Skipped where they are missing, such as in CI.
const local = (slug: string) => `tests/fixtures/local/changelog-${slug}-2026-11-09.md`;
describe.skipIf(!existsSync(local("modal")))("readChangelog on the saved real pages", () => {
  it.each([
    ["e2b", "https://e2b.dev/product-updates", null],
    ["daytona", "https://www.daytona.io/changelog", null],
    ["modal", "https://modal.com/changelog", "Only report changes about sandboxes."],
  ])("%s gives dated entries", (slug, page, focus) => {
    const entries = readChangelog(readFileSync(local(slug as string), "utf8"), page as string, {
      ...range,
      focus: focusWords(focus as string | null),
    });
    console.log(
      slug,
      entries.length,
      entries.slice(0, 3).map((e) => `${e.date.slice(0, 10)} ${e.title}`),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.title.length).toBeLessThan(120);
    }
  });
});
