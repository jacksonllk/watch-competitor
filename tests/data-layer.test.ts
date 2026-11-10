import type { Article } from "@/lib/news";
import { describe, expect, it } from "vitest";
import { addCompetitor } from "@/lib/add-competitor";
import { loadCompetitors, slugFor, type CompetitorRecord } from "@/lib/competitors";
import { APP_TAG } from "@/lib/context";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";
import { checkNews, newsCheckKey, newsKey, type NewsCheck } from "@/lib/news";
import { createMemoryStore } from "@/lib/store/memory";
import { loadChanges, SYNC_CURSOR, syncChanges } from "@/lib/sync";
import { monitorParams, startWatches, stopWatches } from "@/lib/watches";
import { apiError, fakeContext } from "./helpers/fake-context";

const acme: CompetitorRecord = {
  slug: "acme-notes",
  name: "Acme Notes",
  domain: "acme-notes.example",
  logo: null,
  description: null,
  focus: null,
  addedAt: "2026-11-01T00:00:00.000Z",
  status: "watching",
  removedAt: null,
  watches: {},
};

describe("watches", () => {
  it("builds a daily semantic page monitor with our tags", () => {
    expect(monitorParams({ ...acme, focus: "Only report changes about sandboxes." }, "pricing", "https://acme-notes.example/pricing")).toEqual({
      name: "Acme Notes · pricing",
      target: {
        type: "page",
        url: "https://acme-notes.example/pricing",
        instructions:
          "Report any change to plan names, prices, limits or what each plan includes. Ignore wording, layout and testimonial changes. Only report changes about sandboxes.",
      },
      change_detection: { type: "semantic" },
      schedule: { type: "interval", frequency: 1, unit: "days" },
      tags: [APP_TAG, "cw:acme-notes", "kind:pricing"],
    });
  });

  it("creates a monitor only for pages that were found", async () => {
    const { api, created } = fakeContext();
    const { watches } = await startWatches(api.monitors, acme, { pricing: "https://acme-notes.example/pricing" }, "2026-11-09T00:00:00Z");
    expect(created.map((c) => c.name)).toEqual(["Acme Notes · pricing"]);
    expect(watches).toEqual({ pricing: { url: "https://acme-notes.example/pricing", monitorId: "mon_1", addedAt: "2026-11-09T00:00:00Z" } });
  });

  it("deletes every monitor of a removed competitor", async () => {
    const { api, deleted } = fakeContext();
    const watch = { url: "x", addedAt: "y" };
    await stopWatches(api.monitors, {
      ...acme,
      watches: { pricing: { ...watch, monitorId: "mon_a" }, changelog: { ...watch, monitorId: "mon_b" } },
      extra: [{ ...watch, monitorId: "mon_c", kind: "changelog", label: "Blog" }],
    });
    expect(deleted.sort()).toEqual(["mon_a", "mon_b", "mon_c"]);
  });
});

describe("syncChanges", () => {
  it("saves every change under its competitor and moves the cursor to the newest", async () => {
    const store = createMemoryStore();
    const { api, listed } = fakeContext({ changes: fixtureChanges, pageSize: 3 });
    expect(await syncChanges(store, api.monitors)).toEqual({ saved: fixtureChanges.length });
    expect((await loadChanges(store, "acme-notes")).map((c) => c.id)).toEqual(["chg_fx_acme_price", "chg_fx_acme_slack"]);
    expect(await store.get(SYNC_CURSOR)).toBe("2026-11-06T08:40:00Z");
    expect(listed.every((q) => q.tag === APP_TAG)).toBe(true);
    expect(listed.length).toBe(2); // 5 changes in pages of 3
  });

  it("saves nothing twice", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ changes: fixtureChanges });
    await syncChanges(store, api.monitors);
    expect(await syncChanges(store, api.monitors)).toEqual({ saved: 0 });
    expect(await loadChanges(store, "acme-notes")).toHaveLength(2);
  });

  it("keeps the cursor when listing fails, so nothing is skipped", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ changes: fixtureChanges });
    api.monitors.listAccountChanges = async () => {
      throw apiError(500, "INTERNAL_ERROR");
    };
    await expect(syncChanges(store, api.monitors)).rejects.toThrow();
    expect(await store.get(SYNC_CURSOR)).toBeNull();
  });

  it("ignores changes without a competitor tag", async () => {
    const store = createMemoryStore();
    const stray = { ...fixtureChanges[0], id: "chg_stray", tags: [APP_TAG] };
    const { api } = fakeContext({ changes: [stray] });
    expect(await syncChanges(store, api.monitors)).toEqual({ saved: 0 });
  });
});

describe("checkNews", () => {
  const now = new Date("2026-11-09T06:00:00Z");

  it("searches by domain from 90 days before the competitor was added, and keeps one primary article per story", async () => {
    const store = createMemoryStore();
    const { api, searched } = fakeContext({ articles: fixtureNewsSearch.data });
    expect(await checkNews(store, api.news, acme, now)).toEqual({ checked: true, saved: 1, credits: 1 });
    expect(searched[0].searchBy).toEqual({ type: "entity", entity: { type: "domain", domain: "acme-notes.example" } });
    expect(searched[0].filterBy?.date?.from).toBe(Date.parse(acme.addedAt) - 90 * 24 * 60 * 60 * 1000);
    expect(searched[0].tags).toEqual([APP_TAG]);
    expect((await store.get<{ id: string }[]>(newsKey("acme-notes")))!.map((a) => a.id)).toEqual(["art_fx_1"]);
  });

  it("checks at most once a day", async () => {
    const store = createMemoryStore();
    const { api, searched } = fakeContext({ articles: [] });
    await checkNews(store, api.news, acme, now);
    expect(await checkNews(store, api.news, acme, new Date(now.getTime() + 3_600_000))).toEqual({ checked: false, saved: 0, credits: 0 });
    expect(searched).toHaveLength(1);
  });

  it("searches once when a second trigger arrives while the first search runs", async () => {
    const store = createMemoryStore();
    const { api, searched } = fakeContext({ articles: [] });
    const slow = api.news.search;
    let release = () => {};
    api.news.search = async (body) => {
      await new Promise<void>((r) => (release = r));
      return slow(body);
    };
    const first = checkNews(store, api.news, acme, now);
    await new Promise((r) => setTimeout(r, 5)); // the first has claimed and is waiting on context.dev
    expect(await checkNews(store, api.news, acme, new Date(now.getTime() + 1000))).toEqual({ checked: false, saved: 0, credits: 0 });
    release();
    expect((await first).checked).toBe(true);
    expect(searched).toHaveLength(1);
  });

  it("says why it did not work: no news source (404)", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ newsError: apiError(404, "NOT_FOUND") });
    await checkNews(store, api.news, acme, now);
    expect(await store.get<NewsCheck>(newsCheckKey("acme-notes"))).toEqual({
      at: now.toISOString(),
      ok: false,
      reason: "no_news_source",
      nextRefillAt: null,
    });
  });

  it("says why it did not work: out of credits (402), with the refill date", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ newsError: apiError(402, "USAGE_EXCEEDED", { next_refill_at: "2026-12-01T08:01:00Z" }) });
    await checkNews(store, api.news, acme, now);
    expect(await store.get<NewsCheck>(newsCheckKey("acme-notes"))).toMatchObject({
      ok: false,
      reason: "out_of_credits",
      nextRefillAt: "2026-12-01T08:01:00Z",
    });
  });
});

describe("slugFor", () => {
  it("makes a readable slug and avoids a clash with another domain", () => {
    expect(slugFor("Acme Notes", "acme-notes.example", [])).toBe("acme-notes");
    expect(slugFor("Acme Notes", "other.example", [acme])).toBe("acme-notes-2");
    expect(slugFor("Acme Notes", "acme-notes.example", [acme])).toBe("acme-notes");
  });
});

describe("addCompetitor", () => {
  const web = async (url: URL) =>
    url.href === "https://acme-notes.example/pricing" ? { status: 200, location: null } : { status: 404, location: null };

  it("creates monitors only for found pages, saves the competitor and checks its news", async () => {
    const store = createMemoryStore();
    const { api, created, searched, brandSearched } = fakeContext({ articles: fixtureNewsSearch.data });
    const result = await addCompetitor(
      store,
      api,
      { domain: "https://www.Acme-Notes.example/" },
      { fetchHop: web, now: new Date("2026-11-09T06:00:00Z") },
    );
    expect(result.status).toBe("added");
    if (result.status !== "added") return;
    expect(result.competitor).toMatchObject({ slug: "acme-notes", name: "Acme Notes", domain: "acme-notes.example", status: "watching" });
    expect(Object.keys(result.competitor.watches)).toEqual(["pricing"]);
    expect(created.map((c) => c.name)).toEqual(["Acme Notes · pricing"]);
    expect(brandSearched).toEqual(["acme-notes.example"]);
    expect(searched).toHaveLength(1);
    expect(result.usage).toEqual({
      "/v1/monitors/limits": { calls: 1, credits: 0 },
      "Auto-complete": { calls: 1, credits: 1 },
      "/monitors": { calls: 1, credits: 0 },
      "Search News": { calls: 1, credits: 1 },
    });
    expect(result.firstChecks).toBe(1);
    expect((await loadCompetitors(store)).map((c) => c.slug)).toEqual(["acme-notes"]);
  });

  it("does not add a competitor twice", async () => {
    const store = createMemoryStore();
    const { api, created } = fakeContext();
    await addCompetitor(store, api, { domain: "acme-notes.example" }, { fetchHop: web });
    expect((await addCompetitor(store, api, { domain: "acme-notes.example" }, { fetchHop: web })).status).toBe("already_watching");
    expect(created).toHaveLength(1);
  });

  it("stops before spending anything when the monitor slots are full", async () => {
    const store = createMemoryStore();
    const { api, created, brandSearched } = fakeContext({ monitorsUsed: 10 });
    expect(await addCompetitor(store, api, { domain: "acme-notes.example" }, { fetchHop: web })).toEqual({
      status: "no_monitor_slots",
      used: 10,
      limit: 10,
      needed: 1,
    });
    expect(created).toHaveLength(0);
    expect(brandSearched).toHaveLength(0);
  });
});

describe("one article per story", () => {
  it("treats the same day and a similar title as the same story", async () => {
    const { keepArticles } = await import("@/lib/news");
    const base = { ...fixtureNewsSearch.data[0], published_at: "2026-11-05T10:00:00Z" };
    const a = { ...base, id: "a", story_id: "s1", title: "Acme Notes, Which Writes Meeting Notes for Teams, Passes $12 Million in Annual Revenue" };
    const b = { ...base, id: "b", story_id: "s2", title: "Acme Notes, Which Writes Meeting Notes for Teams, Passes $12 Million in Yearly Sales" };
    const c = {
      ...base,
      id: "c",
      story_id: "s3",
      published_at: "2026-11-30T10:00:00Z",
      title: "Acme Notes, Which Writes Meeting Notes for Teams, Opens in Berlin",
    };
    // a and b: one story. c: weeks later, a different story.
    expect(keepArticles([], [a, b, c], "Acme Notes").map((x) => x.id)).toEqual(["c", "a"]);
  });
});

describe("one story, many outlets", () => {
  const at = (id: string, title: string, day: string, story = id) =>
    ({ ...fixtureNewsSearch.data[0], id, story_id: story, title, published_at: `${day}T08:00:00Z` }) as Article;

  it("merges headlines about the same round over a few days, and keeps different news apart", async () => {
    const { oneStoryEach } = await import("@/lib/news");
    const articles = [
      at("a", "Acme Notes Raises $20M at $500M Valuation to Rethink Meeting Notes", "2026-10-23"),
      at("b", "Meeting startup Acme Notes hits $500M valuation backed by Seedcamp", "2026-10-23"),
      at("c", "Acme Notes raises $20M at $500M valuation to build notes for teams", "2026-10-21"),
      at("d", "Acme Notes opens an office in London", "2026-10-22"),
      at("f", "Acme Notes hits $500M valuation with a $20M Series B", "2026-10-19"),
      at("e", "Acme Notes raises $20M more, now at $900M valuation", "2026-12-20"),
    ];
    // f is 4 days before a, but matches c, which is in a's story.
    expect(oneStoryEach(articles, "Acme Notes").map((x) => x.id)).toEqual(["a", "d", "e"]);
  });
});
