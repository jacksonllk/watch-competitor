import { describe, expect, it } from "vitest";
import { slugFor, type CompetitorRecord } from "@/lib/competitors";
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
    await stopWatches(api.monitors, { ...acme, watches: { pricing: { ...watch, monitorId: "mon_a" }, changelog: { ...watch, monitorId: "mon_b" } } });
    expect(deleted).toEqual(["mon_a", "mon_b"]);
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

  it("says why it did not work: no news source (404)", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ newsError: apiError(404, "NOT_FOUND") });
    await checkNews(store, api.news, acme, now);
    expect(await store.get<NewsCheck>(newsCheckKey("acme-notes"))).toEqual({ at: now.toISOString(), ok: false, reason: "no_news_source", nextRefillAt: null });
  });

  it("says why it did not work: out of credits (402), with the refill date", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ newsError: apiError(402, "USAGE_EXCEEDED", { next_refill_at: "2026-12-01T08:01:00Z" }) });
    await checkNews(store, api.news, acme, now);
    expect(await store.get<NewsCheck>(newsCheckKey("acme-notes"))).toMatchObject({ ok: false, reason: "out_of_credits", nextRefillAt: "2026-12-01T08:01:00Z" });
  });
});

describe("slugFor", () => {
  it("makes a readable slug and avoids a clash with another domain", () => {
    expect(slugFor("Acme Notes", "acme-notes.example", [])).toBe("acme-notes");
    expect(slugFor("Acme Notes", "other.example", [acme])).toBe("acme-notes-2");
    expect(slugFor("Acme Notes", "acme-notes.example", [acme])).toBe("acme-notes");
  });
});
