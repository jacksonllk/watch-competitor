import { describe, expect, it } from "vitest";
import { addCompetitor } from "@/lib/add-competitor";
import { DEFAULT_CONFIG, mergeConfig } from "@/lib/config";
import { checkAddress } from "@/lib/find-pages";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";
import { newsCheckKey, newsKey, type NewsCheck } from "@/lib/news";
import { capKey, dailyCap, looksLikeDomain, normalizeDomain, previewCompany, previewKey, searchCompanies } from "@/lib/preview";
import { chooseStore } from "@/lib/store";
import { createMemoryStore } from "@/lib/store/memory";
import { apiError, fakeContext } from "./helpers/fake-context";

const now = new Date("2026-11-09T06:00:00Z");
const web = async (url: URL) =>
  url.href === "https://acme-notes.example/pricing" ? { status: 200, location: null } : { status: 404, location: null };

describe("searchCompanies", () => {
  it("searches by name, caches the answer for a day and counts the credits", async () => {
    const store = createMemoryStore();
    const { api, brandSearched } = fakeContext();
    const first = await searchCompanies(store, api, "  Acme ", { now, cap: 15 });
    expect(first).toMatchObject({ status: "ok", cached: false, spent: { credits: 1 } });
    if (first.status !== "ok") return;
    expect(first.companies.map((c) => c.domain)).toEqual(["acme-notes.example", "acme-notebooks.example"]);
    const again = await searchCompanies(store, api, "acme", { now, cap: 15 });
    expect(again).toMatchObject({ status: "ok", cached: true, spent: { credits: 0 } });
    expect(brandSearched).toEqual(["acme"]);
    expect(await store.get(capKey(now))).toBe(1);
  });

  it("stops at the daily cap without calling the API", async () => {
    const store = createMemoryStore();
    await store.set(capKey(now), 15);
    const { api, brandSearched } = fakeContext();
    expect(await searchCompanies(store, api, "acme", { now, cap: 15 })).toEqual({ status: "cap_reached", cap: 15 });
    expect(brandSearched).toEqual([]);
  });

  it("says when the account is out of credits", async () => {
    const { api } = fakeContext({ brandError: apiError(402, "USAGE_EXCEEDED", { next_refill_at: "2026-11-27T08:01:00.000Z" }) });
    expect(await searchCompanies(createMemoryStore(), api, "acme", { now, cap: 15 })).toEqual({
      status: "out_of_credits",
      nextRefillAt: "2026-11-27T08:01:00.000Z",
    });
  });

  it("does not search for one letter", async () => {
    const { api, brandSearched } = fakeContext();
    expect(await searchCompanies(createMemoryStore(), api, "a", { now, cap: 15 })).toMatchObject({ status: "ok", companies: [] });
    expect(brandSearched).toEqual([]);
  });
});

describe("previewCompany", () => {
  it("reuses the company from the search, keeps news about the company and scans the site", async () => {
    const store = createMemoryStore();
    const { api, brandSearched, searched } = fakeContext({ articles: fixtureNewsSearch.data });
    await searchCompanies(store, api, "acme", { now, cap: 15 });
    const result = await previewCompany(store, api, "acme-notes.example", { now, cap: 15, fetchHop: web, query: "acme" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(brandSearched).toEqual(["acme"]);
    expect(searched[0].filterBy?.date?.from).toBe(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    // One article per story, mentions dropped.
    expect(result.preview.articles.map((a) => a.id)).toEqual(["art_fx_1"]);
    expect(result.preview.pages.pricing?.url).toBe("https://acme-notes.example/pricing");
    expect(result.preview.pages.changelog).toBeNull();
    expect(result.spent.credits).toBe(1);
    expect(await store.get(capKey(now))).toBe(2);

    const again = await previewCompany(store, api, "https://www.acme-notes.example/", { now, cap: 15, fetchHop: web });
    expect(again).toMatchObject({ status: "ok", cached: true, spent: { credits: 0 } });
    expect(searched).toHaveLength(1);
  });

  it("keeps a company with no news source as a preview, so the user can still watch its pages", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ newsError: apiError(404, "NOT_FOUND") });
    const result = await previewCompany(store, api, "acme-notes.example", { now, cap: 15, fetchHop: web });
    expect(result).toMatchObject({ status: "ok", preview: { news: { ok: false, reason: "no_news_source" }, articles: [] } });
  });
});

describe("addCompetitor after a preview", () => {
  it("uses the confirmed pages and the preview's news, with no second brand or news call", async () => {
    const store = createMemoryStore();
    const { api, brandSearched, searched, created } = fakeContext({ articles: fixtureNewsSearch.data });
    await previewCompany(store, api, "acme-notes.example", { now, cap: 15, fetchHop: web });
    const calls = { brand: brandSearched.length, news: searched.length };

    const result = await addCompetitor(
      store,
      api,
      {
        domain: "acme-notes.example",
        focus: "  Only report changes   about teams. ",
        pages: { pricing: "https://acme-notes.example/plans", changelog: null },
      },
      { now: new Date("2026-11-09T06:05:00Z"), instructions: { ...DEFAULT_CONFIG.instructions, pricing: "Report price changes." } },
    );
    expect(result.status).toBe("added");
    if (result.status !== "added") return;
    expect({ brand: brandSearched.length, news: searched.length }).toEqual(calls);
    expect(created).toHaveLength(1);
    expect(created[0].target).toMatchObject({
      url: "https://acme-notes.example/plans",
      instructions: "Report price changes. Only report changes about teams.",
    });
    expect(result.competitor.focus).toBe("Only report changes about teams.");
    expect(result.usage).toEqual({ "/v1/monitors/limits": { calls: 1, credits: 0 }, "/monitors": { calls: 1, credits: 0 } });
    expect((await store.get<unknown[]>(newsKey(result.competitor.slug)))?.length).toBe(1);
    expect(await store.get<NewsCheck>(newsCheckKey(result.competitor.slug))).toEqual({
      at: now.toISOString(),
      ok: true,
      reason: null,
      nextRefillAt: null,
    });
  });

  it("adds a competitor with no pages as news only", async () => {
    const store = createMemoryStore();
    const { api, created } = fakeContext();
    const result = await addCompetitor(store, api, { domain: "acme-notes.example", pages: { pricing: null, changelog: null } }, { now });
    expect(result.status).toBe("added");
    expect(created).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("reads domains", () => {
    expect(normalizeDomain(" https://www.Modal.com/pricing?x=1 ")).toBe("modal.com");
    expect(looksLikeDomain("modal.com")).toBe(true);
    expect(looksLikeDomain("Modal Labs")).toBe(false);
  });

  it("reads the daily cap from the environment", () => {
    expect(dailyCap({})).toBe(15);
    expect(dailyCap({ PREVIEW_DAILY_CREDIT_CAP: "40" })).toBe(40);
    expect(dailyCap({ PREVIEW_DAILY_CREDIT_CAP: "lots" })).toBe(15);
  });

  it("checks an address the user typed", async () => {
    const hop = async (url: URL) =>
      url.href === "https://acme-notes.example/changelog"
        ? { status: 301, location: "/updates" }
        : url.href === "https://acme-notes.example/updates"
          ? { status: 200, location: null }
          : { status: 404, location: null };
    expect(await checkAddress("acme-notes.example/changelog", hop)).toBe("https://acme-notes.example/updates");
    expect(await checkAddress("acme-notes.example/nothing", hop)).toBeNull();
    expect(await checkAddress("not an address", hop)).toBeNull();
  });

  it("merges the settings file over the defaults", () => {
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG);
    const merged = mergeConfig({ instructions: { pricing: " Report price changes. ", changelog: 3 }, alerts: { news: "off" } });
    expect(merged.instructions).toEqual({ pricing: "Report price changes.", changelog: DEFAULT_CONFIG.instructions.changelog });
    expect(merged.alerts.news).toBe("off");
    expect(merged.alerts.pricing).toBe("all");
  });

  it("picks the file store locally and asks for a store on Vercel", () => {
    expect(chooseStore({}, "/tmp/x").kind).toBe("file");
    expect(chooseStore({ VERCEL: "1" }).kind).toBe("missing");
  });

  it("keys the preview cache by bare domain", () => {
    expect(previewKey(normalizeDomain("www.acme.com"))).toBe("preview:acme.com");
  });
});

describe("watch without news", () => {
  it("saves no news and marks the competitor, when the news is about another company", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext({ articles: fixtureNewsSearch.data });
    await previewCompany(store, api, "acme-notes.example", { now, cap: 15, fetchHop: web });
    const result = await addCompetitor(store, api, { domain: "acme-notes.example", news: false, pages: { pricing: null, changelog: null } }, { now });
    expect(result.status).toBe("added");
    if (result.status !== "added") return;
    expect(result.competitor.news).toBe(false);
    expect(await store.get(newsKey(result.competitor.slug))).toBeNull();
    expect(await store.get(newsCheckKey(result.competitor.slug))).toBeNull();
  });
});

describe("news about another company", () => {
  const article = (id: string, title: string) => ({ ...fixtureNewsSearch.data[0], id, story_id: id, title, description: "" });
  it("keeps articles that name the company, and distrusts a result where most do not", async () => {
    const { relevantArticles } = await import("@/lib/news");
    const real = [article("a", "Acme Notes raises a seed round"), article("b", "Ten apps to try"), article("c", "Acme Notes opens in London")];
    expect(relevantArticles(real, "Acme Notes", "acme-notes.example")).toMatchObject({ trusted: true });
    expect(relevantArticles(real, "Acme Notes", "acme-notes.example").articles.map((a) => a.id)).toEqual(["a", "c"]);
    const wrong = [article("x", "boAt revenue doubles"), article("y", "Best soundbars"), article("z", "Deals on Samsung, Boat and others")];
    expect(relevantArticles(wrong, "Boat", "boat.dev")).toEqual({ articles: [], trusted: false });
    expect(relevantArticles([], "Boat", "boat.dev")).toEqual({ articles: [], trusted: true });
  });

  it("treats news about another company as no news, and keeps news on", async () => {
    const store = createMemoryStore();
    const off = [article("x", "boAt revenue doubles"), article("y", "Best soundbars"), article("z", "Cheap earbuds")];
    const { api } = fakeContext({ articles: off });
    const preview = await previewCompany(store, api, "acme-notes.example", { now, cap: 15, fetchHop: web });
    expect(preview).toMatchObject({ status: "ok", preview: { articles: [], news: { ok: true, reason: null } } });
    const result = await addCompetitor(store, api, { domain: "acme-notes.example", pages: { pricing: null, changelog: null } }, { now });
    expect(result.status).toBe("added");
    if (result.status !== "added") return;
    expect(result.competitor.news).toBeUndefined();
    expect(await store.get(newsKey(result.competitor.slug))).toEqual([]);
  });
});
