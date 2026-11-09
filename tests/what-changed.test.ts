import { describe, expect, it } from "vitest";
import { articleToEvent, toEvent } from "@/lib/events";
import { fixtureChanges, longChange } from "@/lib/fixtures/changes";
import { fixtureCompetitors } from "@/lib/fixtures/competitors";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";
import { MAX_ROWS, readDiff, ROW_TEXT_LIMIT, rowText, whatChanged } from "@/lib/what-changed";

const byId = (id: string) => toEvent(fixtureChanges.find((c) => c.id === id)!, fixtureCompetitors)!;

describe("readDiff", () => {
  it("pairs removed and added lines with the same label into old -> new rows", () => {
    expect(readDiff("- Team: $8 per seat a month\n+ Team: $10 per seat a month\n- Free: up to 5 members\n+ Free: up to 3 members")).toEqual([
      { type: "changed", label: "Team", before: "$8 per seat a month", after: "$10 per seat a month" },
      { type: "changed", label: "Free", before: "up to 5 members", after: "up to 3 members" },
    ]);
  });

  it("pairs one removed and one added line without labels", () => {
    expect(readDiff("- Transcripts in 12 languages\n+ Transcripts in 30 languages")).toEqual([
      { type: "changed", label: null, before: "Transcripts in 12 languages", after: "Transcripts in 30 languages" },
    ]);
  });

  it("lists other added lines as New and removed lines as Removed", () => {
    expect(readDiff("+ Slack integration\n+ Teams integration\n- Priority email support")).toEqual([
      { type: "added", text: "Slack integration" },
      { type: "added", text: "Teams integration" },
      { type: "removed", text: "Priority email support" },
    ]);
  });

  it("ignores lines without + or -, empty lines and unchanged values", () => {
    expect(readDiff("Team plan\n+ \n- Team: $8\n+ Team: $8")).toEqual([]);
  });

  it("matches labels regardless of case and cuts long rows", () => {
    const rows = readDiff(`- team: $8\n+ Team: ${"x".repeat(500)}`);
    expect(rows).toHaveLength(1);
    const row = rows[0] as { after: string };
    expect(row.after).toHaveLength(ROW_TEXT_LIMIT);
    expect(row.after.endsWith("…")).toBe(true);
  });
});

describe("whatChanged", () => {
  it("reads the pricing diff into rows", () => {
    expect(whatChanged(byId("chg_fx_acme_price")).rows.map(rowText)).toEqual([
      "Team: $8 per seat a month -> $10 per seat a month",
      "Free: up to 5 members -> up to 3 members",
    ]);
  });

  it("reads a new changelog entry as a New row", () => {
    expect(whatChanged(byId("chg_fx_acme_slack")).rows.map(rowText)).toEqual([
      "New: Slack integration: post notes to any channel when a meeting ends.",
    ]);
  });

  it("uses the short before and after values when there is no diff", () => {
    const event = { ...byId("chg_fx_beta_languages"), diff: null };
    expect(whatChanged(event).rows.map(rowText)).toEqual(["12 languages -> 30 languages"]);
  });

  it("gives the summary alone with no diff and long values", () => {
    const event = { ...toEvent(longChange, fixtureCompetitors)!, diff: null };
    expect(whatChanged(event)).toEqual({ summary: "All three plans have new limits.", rows: [] });
  });

  it(`gives the summary alone with more than ${MAX_ROWS} rows`, () => {
    const diff = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `+ Feature ${i}`).join("\n");
    expect(whatChanged({ ...byId("chg_fx_acme_slack"), diff }).rows).toEqual([]);
  });

  it("gives the article text for news", () => {
    expect(whatChanged(articleToEvent(fixtureNewsSearch.data[0], fixtureCompetitors[0])).rows[0]).toMatchObject({ type: "text" });
  });

  it("writes each row type as one plain line", () => {
    expect(rowText({ type: "changed", label: "Team plan", before: "$8", after: "$10" })).toBe("Team plan: $8 -> $10");
    expect(rowText({ type: "added", text: "Slack integration" })).toBe("New: Slack integration");
    expect(rowText({ type: "removed", text: "Priority email support" })).toBe("Removed: Priority email support");
  });
});
