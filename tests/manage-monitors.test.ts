import { describe, expect, it } from "vitest";
import { addMonitors, removeMonitor } from "@/lib/competitor-actions";
import { allWatches, loadCompetitors, type CompetitorRecord } from "@/lib/competitors";
import { toEvent } from "@/lib/events";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { readMorePages } from "@/lib/server";
import { createMemoryStore } from "@/lib/store/memory";
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
  watches: { pricing: { url: "https://acme-notes.example/pricing", monitorId: "mon_fx_acme_pricing", addedAt: "2026-11-01T00:00:00.000Z" } },
};
const careers = { kind: "page" as const, url: "https://acme-notes.example/careers", label: "Careers", page: "careers" as const };

async function storeWith(c: CompetitorRecord) {
  const store = createMemoryStore();
  await store.set("competitors", [c]);
  return store;
}

describe("Add monitors on the competitor page", () => {
  it("creates one monitor per new page with its page's instruction, and keeps the others", async () => {
    const store = await storeWith(acme);
    const { api, created } = fakeContext();
    const result = await addMonitors(store, api.monitors, "acme-notes", [careers, careers], {}, new Date("2026-11-10T00:00:00Z"));
    expect(result).toMatchObject({ status: "added", count: 1 });
    expect(created.map((c) => c.name)).toEqual(["Acme Notes · Careers"]);
    expect((created[0].target as { instructions: string }).instructions).toMatch(/^Report job openings/);
    const [saved] = await loadCompetitors(store);
    expect(allWatches(saved).map((w) => w.label)).toEqual(["Pricing", "Careers"]);
  });

  it("fills the empty changelog slot with a changelog page", async () => {
    const store = await storeWith(acme);
    const { api } = fakeContext();
    await addMonitors(store, api.monitors, "acme-notes", [{ kind: "changelog", url: "https://acme-notes.example/changelog", label: "Changelog" }]);
    const [saved] = await loadCompetitors(store);
    expect(saved.watches.changelog?.monitorId).toBe("mon_1");
    expect(saved.extra ?? []).toEqual([]);
  });

  it("stops before creating anything when the monitor slots are full, and skips pages already watched", async () => {
    const full = fakeContext({ monitorsUsed: 10 });
    expect(await addMonitors(await storeWith(acme), full.api.monitors, "acme-notes", [careers])).toMatchObject({ status: "no_monitor_slots" });
    expect(full.created).toHaveLength(0);
    const { api } = fakeContext();
    const pricing = { kind: "pricing" as const, url: acme.watches.pricing!.url, label: "Pricing" };
    expect(await addMonitors(await storeWith(acme), api.monitors, "acme-notes", [pricing])).toEqual({ status: "already_watched" });
  });
});

describe("Remove a monitor on the competitor page", () => {
  it("saves its changes, deletes it, and keeps its old changes named after the page", async () => {
    const withCareers: CompetitorRecord = {
      ...acme,
      extra: [{ url: careers.url, monitorId: "mon_careers", addedAt: acme.addedAt, kind: "page", label: "Careers", page: "careers" }],
    };
    const store = await storeWith(withCareers);
    const { api, deleted, listed } = fakeContext({ changes: fixtureChanges });
    const result = await removeMonitor(store, api.monitors, "acme-notes", "mon_careers", new Date("2026-11-10T00:00:00Z"));
    expect(result.status).toBe("removed");
    expect(listed.length).toBeGreaterThan(0); // synced first
    expect(deleted).toEqual(["mon_careers"]);
    const [saved] = await loadCompetitors(store);
    expect(allWatches(saved).map((w) => w.label)).toEqual(["Pricing"]);
    // An old change from the removed monitor still shows as Careers.
    const old = toEvent({ ...fixtureChanges[0], monitor_id: "mon_careers", tags: ["competitor-watch", "cw:acme-notes", "kind:page"] }, [saved]);
    expect(old).toMatchObject({ label: "Careers", page: "careers" });
  });

  it("empties the main slot when the pricing page is removed", async () => {
    const store = await storeWith(acme);
    const { api } = fakeContext();
    await removeMonitor(store, api.monitors, "acme-notes", "mon_fx_acme_pricing");
    expect((await loadCompetitors(store))[0].watches).toEqual({});
  });
});

describe("readMorePages", () => {
  const open = async (url: URL) => (url.pathname === "/gone" ? { status: 404, location: null } : { status: 200, location: null });

  it("keeps a careers page as a careers page, and reads the type from the address when it is missing", async () => {
    expect(await readMorePages([careers, { url: "https://acme-notes.example/customers", label: "Customers" }], open)).toEqual({
      ok: true,
      pages: [careers, { kind: "page", url: "https://acme-notes.example/customers", label: "Customers", page: "customers" }],
    });
  });

  it("names the page that no longer opens", async () => {
    expect(await readMorePages([{ kind: "page", url: "https://acme-notes.example/gone", label: "Jobs" }], open)).toEqual({
      ok: false,
      label: "Jobs",
    });
  });
});
