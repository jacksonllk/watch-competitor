import { describe, expect, it } from "vitest";
import { setupSteps } from "@/app/ui/setting-up";
import { addCompetitor } from "@/lib/add-competitor";
import {
  historyCheckKey,
  historyKey,
  MAX_CHANGELOG_PAGES,
  nextPageUrl,
  readChangelogHistory,
  type HistoryCheck,
  type HistoryEntry,
} from "@/lib/changelog-history";
import { DEFAULT_CONFIG, mergeConfig } from "@/lib/config";
import { createMemoryStore } from "@/lib/store/memory";
import { apiError, fakeContext } from "./helpers/fake-context";

// Made-up changelog pages in the dated-list layout the reader knows (Modal's).
const entry = (n: number, date: string, title: string) =>
  `${n}. [${date} x\\\\ \\\\ **${title}**\\\\ \\\\ About ${title}.](https://acme-notes.example/changelog/${n})`;
const PAGE_1 = "https://acme-notes.example/changelog";
const PAGE_2 = "https://acme-notes.example/changelog?page=2";
const PAGE_3 = "https://acme-notes.example/changelog?page=3";
const next = (href: string) => `<nav><a href="/pricing">Pricing</a><a href="${href}">Older</a></nav>`;
const window90 = { from: "2026-08-12T00:00:00.000Z", to: "2026-11-10T00:00:00.000Z" };

describe("nextPageUrl", () => {
  it("finds the next page number on the same address", () => {
    expect(nextPageUrl(next("/changelog?page=2"), PAGE_1)).toBe(PAGE_2);
    expect(nextPageUrl(`${next("/changelog?page=1")}${next("/changelog?page=3")}`, PAGE_2)).toBe(PAGE_3);
    expect(nextPageUrl(next("/blog/page/2"), "https://acme-notes.example/blog")).toBe("https://acme-notes.example/blog/page/2");
  });

  it("follows a link marked rel=next", () => {
    expect(nextPageUrl('<a rel="next" href="/changelog/older">More</a>', PAGE_1)).toBe("https://acme-notes.example/changelog/older");
  });

  it("ignores other pages, other sites and the page itself", () => {
    expect(nextPageUrl(next("/docs?page=2"), PAGE_1)).toBeNull();
    expect(nextPageUrl(next("https://other.example/changelog?page=2"), PAGE_1)).toBeNull();
    expect(nextPageUrl(next("/changelog?page=1"), PAGE_1)).toBeNull();
    expect(nextPageUrl("<p>No links</p>", PAGE_1)).toBeNull();
  });
});

describe("readChangelogHistory", () => {
  it("reads page 2 while the entries are still inside the window, then stops at the window's start", async () => {
    const { api, scraped } = fakeContext({
      pages: {
        [PAGE_1]: {
          markdown: [entry(1, "November 2, 2026", "Sandbox metrics"), entry(2, "October 1, 2026", "GPU sandboxes")].join("\n"),
          html: next("/changelog?page=2"),
        },
        [PAGE_2]: {
          markdown: [entry(3, "September 1, 2026", "Sidecars"), entry(4, "July 1, 2026", "Old launch")].join("\n"),
          html: next("/changelog?page=3"),
        },
        [PAGE_3]: { markdown: entry(5, "June 1, 2026", "Older launch"), html: "" },
      },
    });
    const usage = {};
    const read = await readChangelogHistory(api.web, PAGE_1, window90, usage);
    expect(scraped).toEqual([PAGE_1, PAGE_2]);
    expect(read).toMatchObject({ ok: true, pages: 2 });
    expect(read.ok && read.entries.map((e) => e.title)).toEqual(["Sandbox metrics", "GPU sandboxes", "Sidecars"]);
    expect(usage).toEqual({ "/v1/web/scrape": { calls: 2, credits: 2 } });
  });

  it("reads one page when the window ends on it", async () => {
    const { api, scraped } = fakeContext({
      pages: {
        [PAGE_1]: {
          markdown: [entry(1, "October 1, 2026", "GPU sandboxes"), entry(2, "July 1, 2026", "Old launch")].join("\n"),
          html: next("/changelog?page=2"),
        },
      },
    });
    await readChangelogHistory(api.web, PAGE_1, window90);
    expect(scraped).toEqual([PAGE_1]);
  });

  it(`reads at most ${MAX_CHANGELOG_PAGES} pages`, async () => {
    const pages: Record<string, { markdown: string; html: string }> = {};
    for (let n = 1; n <= 5; n++) {
      pages[n === 1 ? PAGE_1 : `${PAGE_1}?page=${n}`] = {
        markdown: entry(n, `October ${20 - n}, 2026`, `Launch ${n}`),
        html: next(`/changelog?page=${n + 1}`),
      };
    }
    const { api, scraped } = fakeContext({ pages });
    const read = await readChangelogHistory(api.web, PAGE_1, window90);
    expect(scraped).toHaveLength(MAX_CHANGELOG_PAGES);
    expect(read.ok && read.entries).toHaveLength(MAX_CHANGELOG_PAGES);
  });

  it("stops when a site ignores the page number and serves page 1 again", async () => {
    const page = { markdown: entry(1, "October 1, 2026", "GPU sandboxes"), html: next("/changelog?page=2") };
    const { api, scraped } = fakeContext({ pages: { [PAGE_1]: page, [PAGE_2]: page, [PAGE_3]: page } });
    const read = await readChangelogHistory(api.web, PAGE_1, window90);
    expect(scraped).toEqual([PAGE_1, PAGE_2]);
    expect(read.ok && read.entries).toHaveLength(1);
  });

  it("applies the focus, but pages on by every entry", async () => {
    const { api, scraped } = fakeContext({
      pages: {
        [PAGE_1]: { markdown: entry(1, "October 1, 2026", "New model"), html: next("/changelog?page=2") },
        [PAGE_2]: { markdown: entry(2, "September 1, 2026", "Sandbox sidecars"), html: "" },
      },
    });
    const read = await readChangelogHistory(api.web, PAGE_1, { ...window90, focus: ["sandbox"] });
    expect(scraped).toEqual([PAGE_1, PAGE_2]);
    expect(read.ok && read.entries.map((e) => e.title)).toEqual(["Sandbox sidecars"]);
  });

  it("fails when the first page cannot be read, and names an account cause", async () => {
    expect(await readChangelogHistory(fakeContext().api.web, PAGE_1, window90)).toEqual({ ok: false, reason: "failed", pages: 1 });
    const broke = fakeContext({ scrapeError: apiError(402, "USAGE_EXCEEDED") });
    expect(await readChangelogHistory(broke.api.web, PAGE_1, window90)).toEqual({ ok: false, reason: "out_of_credits", pages: 0 });
  });

  it("keeps page 1 when page 2 cannot be read", async () => {
    const { api } = fakeContext({ pages: { [PAGE_1]: { markdown: entry(1, "October 1, 2026", "GPU sandboxes"), html: next("/changelog?page=2") } } });
    const read = await readChangelogHistory(api.web, PAGE_1, window90);
    expect(read).toMatchObject({ ok: true, pages: 2 });
    expect(read.ok && read.entries.map((e) => e.title)).toEqual(["GPU sandboxes"]);
  });
});

describe("Add reads their changelog", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const input = {
    domain: "acme-notes.example",
    focus: "Only report changes about sandboxes.",
    pages: { pricing: null, changelog: PAGE_1 },
  };
  const pages = { [PAGE_1]: { markdown: [entry(1, "October 1, 2026", "Sandbox sidecars"), entry(2, "October 2, 2026", "New model")].join("\n") } };

  it("saves the last 90 days, with the changelog monitor's focus, and what the read did", async () => {
    const store = createMemoryStore();
    const { api, scraped } = fakeContext({ pages });
    const result = await addCompetitor(store, api, input, { now });
    if (result.status !== "added") throw new Error(result.status);
    expect(scraped).toEqual([PAGE_1]);
    expect((await store.get<HistoryEntry[]>(historyKey(result.competitor.slug)))?.map((e) => e.title)).toEqual(["Sandbox sidecars"]);
    expect(await store.get<HistoryCheck>(historyCheckKey(result.competitor.slug))).toEqual({
      at: now.toISOString(),
      days: 90,
      ok: true,
      count: 1,
      pages: 1,
      reason: null,
    });
    expect(result.usage["/v1/web/scrape"]).toEqual({ calls: 1, credits: 1 });
  });

  it("reads nothing when no changelog is watched, or when the settings turn it off", async () => {
    const off = fakeContext({ pages });
    await addCompetitor(createMemoryStore(), off.api, input, { now, historyDays: 0 });
    const none = fakeContext({ pages });
    await addCompetitor(createMemoryStore(), none.api, { ...input, pages: { pricing: null, changelog: null } }, { now });
    expect([...off.scraped, ...none.scraped]).toEqual([]);
  });

  it("saves a failed read, so the setup box can say so", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ scrapeError: apiError(402, "USAGE_EXCEEDED") });
    const result = await addCompetitor(store, api, input, { now });
    if (result.status !== "added") throw new Error(result.status);
    expect(await store.get<HistoryCheck>(historyCheckKey(result.competitor.slug))).toMatchObject({ ok: false, reason: "out_of_credits", count: 0 });
    expect(await store.get(historyKey(result.competitor.slug))).toBeNull();
  });
});

describe("the setup box line", () => {
  const base = { isNew: true, news: null, monitors: [] };
  it("says what was read, or that it failed", () => {
    expect(setupSteps({ ...base, history: { ok: true, days: 90 } })).toContainEqual({
      state: "done",
      text: "Read their changelog from the last 90 days",
    });
    expect(setupSteps({ ...base, history: { ok: false, days: 90, support: true } })).toContainEqual({
      state: "problem",
      text: "Changelog history failed. Contact support.",
    });
    expect(setupSteps({ ...base, history: null }).map((s) => s.text)).toEqual(["Found the company details"]);
  });
});

describe("history.changelogDays in the settings file", () => {
  it("is 90 by default, 0 turns it off, and anything outside 0 to 365 falls back to 90", () => {
    expect(DEFAULT_CONFIG.history.changelogDays).toBe(90);
    expect(mergeConfig({ history: { changelogDays: 0 } }).history.changelogDays).toBe(0);
    expect(mergeConfig({ history: { changelogDays: 180 } }).history.changelogDays).toBe(180);
    for (const bad of [-1, 400, 1.5, "ninety"]) expect(mergeConfig({ history: { changelogDays: bad } }).history.changelogDays).toBe(90);
  });
});

describe("what the screen says under a monitor", () => {
  it("describes the default checks in plain words, and shows a developer's own instruction as it is", async () => {
    const { describeMonitor, MAIN_DESCRIPTIONS } = await import("@/lib/config");
    expect(describeMonitor("pricing", DEFAULT_CONFIG)).toBe(MAIN_DESCRIPTIONS.pricing);
    expect(describeMonitor("changelog", DEFAULT_CONFIG)).toBe(MAIN_DESCRIPTIONS.changelog);
    const custom = mergeConfig({ instructions: { pricing: "Report price changes for teams." } });
    expect(describeMonitor("pricing", custom)).toBe("Report price changes for teams.");
  });
});

describe("changelog changes with nothing new", () => {
  const event = (diff: string) =>
    ({ id: "c", kind: "changelog", competitor: { slug: "acme", name: "Acme", domain: "acme.example" }, title: "Monitored value changed", summary: "", detectedAt: "2026-11-12T09:00:00Z", url: "", importance: "medium", before: null, after: null, diff, excerpt: null }) as const;
  const renumbered = ["- 1. Nov 2 **Image Builder 2026.10**", "- 2. Oct 27 **Exit Snapshots for Sandboxes**", "+ 1. Nov 11 **Invoices in the dashboard**", "+ 2. Nov 4 **Kimi K3.1 Pro on Shared Endpoints**", "+ 3. Nov 2 **Image Builder 2026.10**", "+ 4. Oct 27 **Exit Snapshots for Sandboxes**"].join("\n");

  it("finds the lines that are really new, ignoring list numbers", async () => {
    const { newDiffLines } = await import("@/lib/events");
    expect(newDiffLines(renumbered)).toEqual(["Nov 11 **Invoices in the dashboard**", "Nov 4 **Kimi K3.1 Pro on Shared Endpoints**"]);
  });

  it("hides a change that only renumbers or moves entries", async () => {
    const { isChangelogNoise } = await import("@/lib/events");
    expect(isChangelogNoise(event("- 1. Nov 2 **Image Builder**\n+ 3. Nov 2 **Image Builder**"), [])).toBe(true);
  });

  it("hides new entries that miss the focus, and keeps ones that match it or any new entry without a focus", async () => {
    const { isChangelogNoise } = await import("@/lib/events");
    expect(isChangelogNoise(event(renumbered), ["sandbox"])).toBe(true);
    expect(isChangelogNoise(event(renumbered), [])).toBe(false);
    expect(isChangelogNoise(event(`${renumbered}\n+ 5. Nov 12 **Sandbox sidecars GA**`), ["sandbox"])).toBe(false);
  });

  it("leaves pricing, news and past launches alone", async () => {
    const { isChangelogNoise } = await import("@/lib/events");
    expect(isChangelogNoise({ ...event("- 1. a\n+ 2. a"), kind: "pricing" }, [])).toBe(false);
    expect(isChangelogNoise({ ...event("- 1. a\n+ 2. a"), origin: "changelog" }, [])).toBe(false);
  });
});
