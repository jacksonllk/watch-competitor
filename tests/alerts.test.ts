import { describe, expect, it } from "vitest";
import { ALERTS_SENT, ALERTS_SINCE, MAX_ITEMS, passes, sendAlerts, slackMessage } from "@/lib/alerts";
import type { CompetitorRecord } from "@/lib/competitors";
import { DEFAULT_CONFIG } from "@/lib/config";
import type { CompetitorEvent } from "@/lib/events";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";
import { newsKey } from "@/lib/news";
import { createMemoryStore } from "@/lib/store/memory";
import { changesKey } from "@/lib/sync";

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

const event = (patch: Partial<CompetitorEvent>): CompetitorEvent => ({
  id: "e1",
  kind: "pricing",
  competitor: { slug: "acme-notes", name: "Acme Notes", domain: "acme-notes.example" },
  title: "Team plan price up",
  summary: "The Team plan went from $8 to $10.",
  detectedAt: "2026-11-04T09:00:00Z",
  url: "https://acme-notes.example/pricing",
  importance: "medium",
  before: null,
  after: null,
  diff: "- Team: $8\n+ Team: $10",
  excerpt: null,
  ...patch,
});

async function storeWithChanges() {
  const store = createMemoryStore();
  await store.set("competitors", [acme]);
  await store.set(
    changesKey("acme-notes"),
    fixtureChanges.filter((c) => c.tags.includes("cw:acme-notes")),
  );
  await store.set(newsKey("acme-notes"), fixtureNewsSearch.data.slice(0, 1));
  return store;
}

describe("alert settings", () => {
  it("follows each type's level and the muted list", () => {
    const alerts = DEFAULT_CONFIG.alerts;
    expect(passes(event({ kind: "pricing", importance: "low" }), alerts)).toBe(true);
    expect(passes(event({ kind: "changelog", importance: "medium" }), alerts)).toBe(false);
    expect(passes(event({ kind: "changelog", importance: "high" }), alerts)).toBe(true);
    expect(passes(event({ kind: "news", importance: null }), alerts)).toBe(true);
    expect(passes(event({}), { ...alerts, muted: ["acme-notes"] })).toBe(false);
    expect(passes(event({}), { ...alerts, pricing: "off" })).toBe(false);
  });
});

describe("Slack message", () => {
  it("lists each change with its competitor, type, linked title and old -> new, escaping Slack's characters", () => {
    const { text } = slackMessage([event({ title: "Plans <new> & improved" })], "https://watch.example");
    expect(text).toBe(
      "*Competitor Watch* · 1 new change\n" +
        "• *Acme Notes* · Pricing · <https://watch.example/c/acme-notes|Plans &lt;new&gt; &amp; improved>\n" +
        "   $8 → $10",
    );
  });

  it(`shows at most ${MAX_ITEMS} changes, then counts the rest`, () => {
    const many = Array.from({ length: MAX_ITEMS + 3 }, (_, i) => event({ id: `e${i}` }));
    const { text } = slackMessage(many, null);
    expect(text.match(/^• /gm)).toHaveLength(MAX_ITEMS);
    expect(text.endsWith("+3 more in Competitor Watch")).toBe(true);
    // Without APP_URL, links go to the source page.
    expect(text).toContain("<https://acme-notes.example/pricing|");
  });
});

describe("sendAlerts", () => {
  it("is off without a webhook URL", async () => {
    expect(await sendAlerts(createMemoryStore(), [acme], DEFAULT_CONFIG.alerts, {})).toEqual({ status: "off" });
  });

  it("starts quietly, then posts only what is new, once", async () => {
    const store = await storeWithChanges();
    const posted: string[] = [];
    const post = async (_url: string, body: string) => (posted.push(body), true);
    const options = { webhookUrl: "https://hooks.slack.example/x", post };

    // First run: records the time. Nothing old is posted.
    expect(await sendAlerts(store, [acme], DEFAULT_CONFIG.alerts, { ...options, now: new Date("2026-11-04T00:00:00Z") })).toEqual({
      status: "started",
    });
    expect(posted).toHaveLength(0);
    expect(await store.get(ALERTS_SINCE)).toBe("2026-11-04T00:00:00.000Z");

    // The fixture's pricing change (Nov 4, 09:12) is after that time: posted once.
    const sent = await sendAlerts(store, [acme], DEFAULT_CONFIG.alerts, options);
    expect(sent).toMatchObject({ status: "sent" });
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0]).text).toContain("*Acme Notes* · Pricing");
    expect(await sendAlerts(store, [acme], DEFAULT_CONFIG.alerts, options)).toEqual({ status: "nothing_new" });
    expect(posted).toHaveLength(1);
  });

  it("keeps changes unsent when Slack fails, so the next run tries again", async () => {
    const store = await storeWithChanges();
    await store.set(ALERTS_SINCE, "2026-11-01T00:00:00.000Z");
    const fail = async () => false;
    expect(await sendAlerts(store, [acme], DEFAULT_CONFIG.alerts, { webhookUrl: "https://hooks.slack.example/x", post: fail })).toEqual({
      status: "failed",
    });
    expect(await store.get(ALERTS_SENT)).toBeNull();
  });
});
