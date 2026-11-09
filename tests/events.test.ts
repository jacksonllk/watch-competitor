import { describe, expect, it } from "vitest";
import { articleToEvent, kindOf, slugOf, toEvent } from "@/lib/events";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { fixtureCompetitors } from "@/lib/fixtures/competitors";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";

const byId = (id: string) => fixtureChanges.find((c) => c.id === id)!;

describe("toEvent", () => {
  it("maps every fixture change to an event", () => {
    const events = fixtureChanges.map((c) => toEvent(c, fixtureCompetitors));
    expect(events.every(Boolean)).toBe(true);
  });

  it("takes the kind from the kind: tag, not target_type", () => {
    // Pricing and Changelog are both page targets.
    expect(toEvent(byId("chg_fx_acme_price"), fixtureCompetitors)!.kind).toBe("pricing");
    expect(toEvent(byId("chg_fx_acme_slack"), fixtureCompetitors)!.kind).toBe("changelog");
  });

  it("finds the competitor from the cw:<slug> tag", () => {
    const event = toEvent(byId("chg_fx_beta_languages"), fixtureCompetitors)!;
    expect(event.competitor).toEqual({ slug: "beta-minutes", name: "Beta Minutes", domain: "beta-minutes.example" });
  });

  it("uses the diff as the excerpt for a page", () => {
    expect(toEvent(byId("chg_fx_acme_price"), fixtureCompetitors)!.excerpt).toContain("+ Team: $10 per seat a month");
  });

  it("maps a News article to a news event with the article text", () => {
    const event = articleToEvent(fixtureNewsSearch.data[0], fixtureCompetitors[0]);
    expect(event).toMatchObject({ kind: "news", title: "Acme Notes announces a seed round", detectedAt: "2026-11-03T06:00:00Z", importance: null });
    expect(event.excerpt).toContain("double its sales team");
  });

  it("skips a change without our tags or for a competitor no longer watched", () => {
    const change = byId("chg_fx_acme_price");
    expect(toEvent({ ...change, tags: ["cw:acme-notes"] }, fixtureCompetitors)).toBeNull();
    expect(toEvent({ ...change, tags: ["competitor-watch", "kind:pricing"] }, fixtureCompetitors)).toBeNull();
    expect(toEvent(change, fixtureCompetitors.filter((c) => c.slug !== "acme-notes"))).toBeNull();
  });

  it("ignores unknown kind tags and the bare cw tag", () => {
    expect(kindOf(["kind:hiring", "kind:news"])).toBe("news");
    expect(slugOf(["competitor-watch", "cw:"])).toBeNull();
  });
});
