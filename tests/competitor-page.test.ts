import { describe, expect, it } from "vitest";
import { relative } from "@/app/ui/format";
import { checkNow, deleteHistory, editAddress, removeCompetitor } from "@/lib/competitor-actions";
import { loadCompetitorPage } from "@/lib/competitor-page";
import { loadCompetitors, type CompetitorRecord } from "@/lib/competitors";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";
import { newsCheckKey, newsKey } from "@/lib/news";
import { createMemoryStore } from "@/lib/store/memory";
import { changesKey, loadChanges } from "@/lib/sync";
import { fakeContext } from "./helpers/fake-context";

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
  watches: {
    pricing: { url: "https://acme-notes.example/pricing", monitorId: "mon_p", addedAt: "2026-11-01T00:00:00.000Z" },
    changelog: { url: "https://acme-notes.example/changelog", monitorId: "mon_c", addedAt: "2026-11-01T00:00:00.000Z" },
  },
};

async function storeWith(record: CompetitorRecord) {
  const store = createMemoryStore();
  await store.set("competitors", [record]);
  return store;
}

describe("competitor actions", () => {
  it("checks each page once", async () => {
    const store = await storeWith(acme);
    const { api, ran } = fakeContext();
    expect(await checkNow(store, api.monitors, "acme-notes")).toMatchObject({ status: "started", pages: 2 });
    expect(ran.sort()).toEqual(["mon_c", "mon_p"]);
    expect(await checkNow(store, api.monitors, "nobody")).toEqual({ status: "not_found" });
  });

  it("saves every change before it deletes the monitors, and keeps the competitor as removed", async () => {
    const store = await storeWith(acme);
    const { api, deleted, listed } = fakeContext({ changes: fixtureChanges });
    const result = await removeCompetitor(store, api.monitors, "acme-notes", new Date("2026-11-09T10:00:00Z"));
    expect(result).toMatchObject({ status: "removed", competitor: { status: "removed", removedAt: "2026-11-09T10:00:00.000Z" } });
    expect(listed.length).toBeGreaterThan(0);
    expect(deleted.sort()).toEqual(["mon_c", "mon_p"]);
    expect((await loadChanges(store, "acme-notes")).length).toBeGreaterThan(0);
    expect(await removeCompetitor(store, api.monitors, "acme-notes")).toEqual({ status: "not_watching" });
  });

  it("deletes history only for a removed competitor", async () => {
    const store = await storeWith(acme);
    await store.set(changesKey("acme-notes"), fixtureChanges);
    await store.set(newsKey("acme-notes"), fixtureNewsSearch.data);
    expect(await deleteHistory(store, "acme-notes")).toEqual({ status: "still_watching" });
    await store.set("competitors", [{ ...acme, status: "removed" }]);
    expect(await deleteHistory(store, "acme-notes")).toEqual({ status: "deleted" });
    expect(await loadCompetitors(store)).toEqual([]);
    expect(await store.get(changesKey("acme-notes"))).toBeNull();
    expect(await store.get(newsKey("acme-notes"))).toBeNull();
  });

  it("deletes the changelog history and the monitors' webhook secrets too", async () => {
    const { historyKey } = await import("@/lib/changelog-history");
    const { loadSecrets, saveSecrets } = await import("@/lib/webhook");
    const store = await storeWith({ ...acme, status: "removed" });
    await store.set(historyKey("acme-notes"), [{ id: "h", date: "2026-10-01T12:00:00Z", title: "x", summary: "", url: "" }]);
    await saveSecrets(store, { mon_p: "whsec_p", mon_c: "whsec_c", mon_other: "whsec_o" });
    await deleteHistory(store, "acme-notes");
    expect(await store.get(historyKey("acme-notes"))).toBeNull();
    expect(await loadSecrets(store)).toEqual({ mon_other: "whsec_o" });
  });
});

describe("edit address", () => {
  it("points the monitor at the new address with the same instructions, resumes it and saves the address", async () => {
    const store = await storeWith({ ...acme, focus: "Only report changes about teams." });
    const { api, updated } = fakeContext();
    const result = await editAddress(store, api.monitors, "acme-notes", "mon_p", "https://acme-notes.example/plans");
    expect(result.status).toBe("updated");
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe("mon_p");
    expect(updated[0].body).toMatchObject({ status: "active", target: { type: "page", url: "https://acme-notes.example/plans" } });
    expect((updated[0].body.target as { instructions: string }).instructions).toContain("Only report changes about teams.");
    expect((await loadCompetitors(store))[0].watches.pricing?.url).toBe("https://acme-notes.example/plans");
  });

  it("edits an extra page, and refuses a monitor that is not this competitor's", async () => {
    const extra = [{ url: "https://acme-notes.example/blog", monitorId: "mon_b", addedAt: "x", kind: "changelog" as const, label: "Blog" }];
    const store = await storeWith({ ...acme, extra });
    const { api } = fakeContext();
    await editAddress(store, api.monitors, "acme-notes", "mon_b", "https://acme-notes.example/news");
    expect((await loadCompetitors(store))[0].extra?.[0].url).toBe("https://acme-notes.example/news");
    expect(await editAddress(store, api.monitors, "acme-notes", "mon_other", "https://x.example")).toEqual({ status: "not_found" });
  });
});

describe("loadCompetitorPage", () => {
  it("splits news into before and after it was added, and filters by kind", async () => {
    const store = await storeWith({ ...acme, addedAt: "2026-11-02T00:00:00.000Z" });
    await store.set(newsKey("acme-notes"), [
      { ...fixtureNewsSearch.data[0], id: "after", published_at: "2026-11-03T06:00:00Z" },
      { ...fixtureNewsSearch.data[0], id: "before", story_id: "other", published_at: "2026-10-20T06:00:00Z" },
    ]);
    await store.set(newsCheckKey("acme-notes"), { at: "2026-11-02T00:00:00Z", ok: true, reason: null, nextRefillAt: null });
    const saved = {
      at: "2026-11-09T00:00:00Z",
      failedAt: null,
      states: {
        mon_p: { kind: "pricing" as const, state: "working" as const, lastChecked: "2026-11-08T09:00:00Z", compared: true },
        mon_c: { kind: "changelog" as const, state: "setting_up" as const },
      },
      nextRuns: { mon_p: "2026-11-09T09:00:00Z", mon_c: "2026-11-09T12:00:00Z" },
    };
    const page = await loadCompetitorPage(store, "acme-notes", saved);
    expect(page?.events.map((e) => e.id)).toEqual(["after"]);
    expect(page?.before.map((e) => e.id)).toEqual(["before"]);
    expect(page?.nextCheck).toBe("2026-11-09T09:00:00Z");
    expect(page?.settingUp).toBe(true);
    expect(page?.compared).toBe(true);
    expect((await loadCompetitorPage(store, "acme-notes", saved, { kind: "pricing" }))?.events).toEqual([]);
    expect(page?.filters.map((f) => f.label)).toEqual(["Features", "Pricing", "News"]);
    expect(await loadCompetitorPage(store, "nobody", saved)).toBeNull();
  });

  it("gives each extra page its own filter, named after its tag", async () => {
    const store = await storeWith({
      ...acme,
      extra: [
        { url: "https://acme-notes.example/careers", monitorId: "mon_k", addedAt: acme.addedAt, kind: "page", label: "Careers", page: "careers" },
        { url: "https://acme-notes.example/integrations", monitorId: "mon_i", addedAt: acme.addedAt, kind: "changelog", label: "Integrations" },
      ],
    });
    const page = await loadCompetitorPage(store, "acme-notes", null, { kind: "careers" });
    expect(page?.filters.map((f) => [f.key, f.label])).toEqual([
      ["changelog", "Features"],
      ["pricing", "Pricing"],
      ["news", "News"],
      ["careers", "Careers"],
      ["integrations", "Integrations"],
    ]);
    expect(page?.filter).toBe("careers");
    expect((await loadCompetitorPage(store, "acme-notes", null, { kind: "page" }))?.filter).toBeNull();
  });

  it("shows a page the user chose not to watch as not watched, not as broken", async () => {
    const store = await storeWith({ ...acme, watches: { pricing: acme.watches.pricing } });
    const page = await loadCompetitorPage(store, "acme-notes", null);
    expect(page?.watches.find((w) => w.kind === "changelog")).toEqual({ kind: "changelog", url: null, state: null, label: "Changelog" });
  });
});

describe("relative", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  it("says times in plain words", () => {
    expect(relative("2026-11-09T09:59:50Z", now)).toBe("just now");
    expect(relative("2026-11-09T08:00:00Z", now)).toBe("2 hours ago");
    expect(relative("2026-11-09T16:00:00Z", now)).toBe("in 6 hours");
    expect(relative("2026-11-06T10:00:00Z", now)).toBe("3 days ago");
  });
});
