import { describe, expect, it } from "vitest";
import { kindOf, slugOf, toEvent } from "@/lib/events";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { fixtureCompetitors } from "@/lib/fixtures/competitors";

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
    expect(toEvent(byId("chg_fx_acme_seed"), fixtureCompetitors)!.kind).toBe("news");
  });

  it("finds the competitor from the cw:<slug> tag", () => {
    const event = toEvent(byId("chg_fx_beta_languages"), fixtureCompetitors)!;
    expect(event.competitor).toEqual({ slug: "beta-minutes", name: "Beta Minutes", domain: "beta-minutes.example" });
  });

  it("uses the diff as the excerpt for a page, and the article text for news", () => {
    expect(toEvent(byId("chg_fx_acme_price"), fixtureCompetitors)!.excerpt).toContain("+ Team: $10 per seat a month");
    expect(toEvent(byId("chg_fx_acme_seed"), fixtureCompetitors)!.excerpt).toContain("double its sales team");
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
