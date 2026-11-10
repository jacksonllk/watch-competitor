import type { MonitorListRunsResponse } from "context.dev/resources";
import { describe, expect, it } from "vitest";
import type { CompetitorRecord } from "@/lib/competitors";
import { fixtureChanges } from "@/lib/fixtures/changes";
import { fixtureNewsSearch } from "@/lib/fixtures/preview";
import { newsCheckKey, newsKey } from "@/lib/news";
import { earliestDay, isShown, loadOverview, mondayOf, readFilter, readRange } from "@/lib/overview";
import { isDue, loadSavedStates, nextRun, refresh, showStaleWarning, watchForResults } from "@/lib/refresh";
import { createMemoryStore } from "@/lib/store/memory";
import { changesKey } from "@/lib/sync";
import { monitorState, newsState, readMonitors } from "@/lib/watch-status";
import { longDay, monthStart, rangeText, toDay, toNum, weekday, weekStart } from "@/app/ui/time";
import { fakeContext } from "./helpers/fake-context";

type Run = MonitorListRunsResponse.Data;
const run = (patch: Partial<Run>): Run => ({
  id: "run",
  monitor_id: "mon_1",
  status: "completed",
  run_type: "scheduled",
  target_type: "page",
  change_detection_type: "semantic",
  baseline_created: false,
  change_detected: false,
  credits_charged: 1,
  started_at: "2026-11-08T09:00:00Z",
  completed_at: "2026-11-08T09:00:20Z",
  ...patch,
});

describe("days", () => {
  it("finds Monday, numbers days and names them in UTC", () => {
    expect(mondayOf(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11-02");
    const n = toNum("2026-11-09");
    expect(toDay(n)).toBe("2026-11-09");
    expect(toNum("2026-11-09T23:59:00Z")).toBe(n);
    expect(weekday(n)).toBe(1);
    expect(longDay(n)).toBe("Mon, Nov 9");
    expect(toDay(monthStart(n))).toBe("2026-11-01");
    expect(toDay(monthStart(n, -1))).toBe("2026-10-01");
    expect(toDay(monthStart(toNum("2026-01-15"), -1))).toBe("2025-12-01");
  });

  it("writes a range short, with years only when it leaves this year", () => {
    const today = toNum("2026-11-09");
    expect(rangeText(toNum("2026-10-11"), today, today)).toBe("Oct 11 – Nov 9");
    expect(rangeText(today, today, today)).toBe("Nov 9");
    expect(rangeText(toNum("2026-11-03"), today, today)).toBe("Nov 3–9");
    expect(rangeText(toNum("2025-12-28"), toNum("2026-01-03"), today)).toBe("Dec 28, 2025 – Jan 3, 2026");
    expect(toDay(weekStart(today))).toBe("2026-11-08");
  });
});

describe("monitorState", () => {
  it("is setting up until the first check completes", () => {
    expect(monitorState("pricing", [], "active")).toEqual({ kind: "pricing", state: "setting_up" });
    expect(monitorState("pricing", [run({ status: "running", run_type: "baseline", completed_at: null })], "active").state).toBe("setting_up");
  });

  it("is working after a completed check", () => {
    expect(monitorState("pricing", [run({ run_type: "baseline", baseline_created: true })], "active")).toEqual({
      kind: "pricing",
      state: "working",
      lastChecked: "2026-11-08T09:00:20Z",
      compared: false,
    });
    expect(monitorState("pricing", [run({}), run({ run_type: "baseline" })], "active")).toMatchObject({ state: "working", compared: true });
  });

  it("is not working after a failed fetch, since the first failure in a row", () => {
    const runs = [
      run({ status: "failed", error: { code: "fetch_failed", message: "" }, started_at: "2026-11-08T09:00:00Z" }),
      run({ status: "failed", error: { code: "fetch_failed", message: "" }, started_at: "2026-11-07T09:00:00Z" }),
      run({ started_at: "2026-11-06T09:00:00Z" }),
    ];
    expect(monitorState("pricing", runs, "active")).toEqual({
      kind: "pricing",
      state: "not_working",
      reason: "the page was not found or has no readable text",
      since: "2026-11-07T09:00:00Z",
      fix: "edit_address",
    });
  });

  it("shows a judge failure only after 2 in a row", () => {
    const judge = run({ status: "failed", error: { code: "judge_failed", message: "" } });
    expect(monitorState("changelog", [judge, run({})], "active").state).toBe("working");
    expect(monitorState("changelog", [judge, judge, run({})], "active").state).toBe("not_working");
  });

  it("says when credits ran out or the monitor was paused", () => {
    const skipped = run({ status: "skipped", skip_reason: "insufficient_credits", credits_charged: 0 });
    expect(monitorState("pricing", [skipped, run({})], "active")).toMatchObject({ state: "not_working", fix: "wait_for_refill" });
    const failed = run({ status: "failed", error: { code: "fetch_failed", message: "" } });
    expect(monitorState("pricing", [failed, failed, failed], "paused")).toMatchObject({
      state: "not_working",
      reason: "paused after repeated failures: the page was not found or has no readable text",
      fix: "resume",
    });
  });

  it("reads News from our last check", () => {
    expect(newsState(null).state).toBe("setting_up");
    expect(newsState({ at: "2026-11-09T01:45:00Z", ok: true, reason: null, nextRefillAt: null }).state).toBe("working");
    expect(newsState({ at: "2026-11-09T01:45:00Z", ok: false, reason: "no_news_source", nextRefillAt: null })).toMatchObject({
      state: "not_working",
      reason: "no news source covers this company",
    });
  });
});

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
  watches: { pricing: { url: "https://acme-notes.example/pricing", monitorId: "mon_p", addedAt: "2026-11-01T00:00:00.000Z" } },
};

describe("readMonitors", () => {
  const listed = (patch: Record<string, unknown> = {}) => [
    {
      id: "mon_p",
      status: "active",
      last_run_at: "2026-11-08T09:00:20Z",
      last_change_at: null,
      next_run_at: "2026-11-09T09:00:00Z",
      ...patch,
    } as never,
  ];

  it("flags a monitor that no longer exists", async () => {
    const { api } = fakeContext({ monitors: [] });
    expect((await readMonitors(api.monitors, [acme], null)).states.get("mon_p")).toMatchObject({ state: "not_working" });
  });

  it("reads runs only for monitors whose last run moved", async () => {
    let reads = 0;
    const { api } = fakeContext({ monitors: listed(), runs: { mon_p: [run({})] } });
    const listRuns = api.monitors.listRuns.bind(api.monitors);
    api.monitors.listRuns = (id, q) => {
      reads++;
      return listRuns(id, q);
    };
    const first = await readMonitors(api.monitors, [acme], null);
    expect(first.states.get("mon_p")).toMatchObject({ state: "working" });
    expect(first.nextRuns).toEqual({ mon_p: "2026-11-09T09:00:00Z" });
    const previous = { states: Object.fromEntries(first.states), lastRuns: first.lastRuns, lastChanges: first.lastChanges, statuses: first.statuses };
    expect((await readMonitors(api.monitors, [acme], previous)).runsRead).toBe(0);
    api.monitors.list = async () => ({ data: listed({ last_run_at: "2026-11-09T09:00:30Z" }), has_more: false, next_cursor: null, request_id: "r" });
    expect((await readMonitors(api.monitors, [acme], previous)).runsRead).toBe(1);
    expect(reads).toBe(2);
  });

  it("asks for a change sync only when a monitor reports a newer change", async () => {
    const { api } = fakeContext({ monitors: listed(), runs: { mon_p: [run({})] } });
    const first = await readMonitors(api.monitors, [acme], null);
    expect(first.changesMoved).toBe(true);
    const previous = { states: Object.fromEntries(first.states), lastRuns: first.lastRuns, lastChanges: first.lastChanges, statuses: first.statuses };
    expect((await readMonitors(api.monitors, [acme], previous)).changesMoved).toBe(false);
    api.monitors.list = async () => ({
      data: listed({ last_change_at: "2026-11-09T09:00:40Z" }),
      has_more: false,
      next_cursor: null,
      request_id: "r",
    });
    expect((await readMonitors(api.monitors, [acme], previous)).changesMoved).toBe(true);
  });
});

describe("loadOverview", () => {
  it("loads every important change and news, and each watch's state", async () => {
    const store = createMemoryStore();
    const acmeChanges = fixtureChanges.filter((c) => c.tags.includes("cw:acme-notes"));
    await store.set(changesKey("acme-notes"), acmeChanges);
    await store.set(newsKey("acme-notes"), fixtureNewsSearch.data.slice(0, 1));
    await store.set(newsCheckKey("acme-notes"), { at: "2026-11-02T00:00:00Z", ok: true, reason: null, nextRefillAt: null });
    const states = new Map([["mon_p", { kind: "pricing" as const, state: "working" as const, lastChecked: null, compared: true }]]);

    const data = await loadOverview(store, [acme, { ...acme, slug: "old", status: "removed", removedAt: "2026-11-05T00:00:00Z" }], states);
    expect(data.rows).toHaveLength(1);
    expect(data.removed.map((c) => c.slug)).toEqual(["old"]);
    expect(data.watchesTotal).toBe(2);
    expect(data.watchesWorking).toBe(2);
    for (const e of data.events) expect(isShown(e)).toBe(true);
    expect(data.events.some((e) => e.kind === "news")).toBe(true);
    const days = data.events.map((e) => e.detectedAt);
    expect(days).toEqual([...days].sort().reverse());
  });

  it("hides low importance except for pricing", () => {
    const base = { id: "x", competitor: acme, title: "", summary: "", detectedAt: "", url: "", before: null, after: null, diff: null, excerpt: null };
    expect(isShown({ ...base, kind: "changelog", importance: "low" })).toBe(false);
    expect(isShown({ ...base, kind: "pricing", importance: "low" })).toBe(true);
    expect(isShown({ ...base, kind: "news", importance: null })).toBe(true);
  });
});

describe("refresh", () => {
  const at = new Date("2026-11-09T10:00:00Z");
  const later = (ms: number) => new Date(at.getTime() + ms);
  const monitors = [
    { id: "mon_p", status: "active", last_run_at: "2026-11-09T09:00:20Z", last_change_at: null, next_run_at: "2026-11-10T09:00:00Z" } as never,
  ];

  it("reads once, then waits until a monitor run is due", async () => {
    const store = createMemoryStore();
    await store.set("competitors", [acme]);
    const { api, listed } = fakeContext({ monitors, runs: { mon_p: [run({})] } });
    expect(await refresh(store, api.monitors, { now: at })).toMatchObject({ status: "refreshed", changedStates: true, synced: true });
    expect((await loadSavedStates(store))?.states.mon_p).toMatchObject({ state: "working" });
    expect(await refresh(store, api.monitors, { now: later(10 * 60_000) })).toEqual({ status: "fresh" });
    expect(listed).toHaveLength(1);
    // The next run is due at 09:00 the next day.
    expect(await refresh(store, api.monitors, { now: new Date("2026-11-10T09:01:00Z") })).toMatchObject({
      status: "refreshed",
      synced: false,
      runsRead: 0,
    });
  });

  it("reads every 5 minutes for 20 minutes after Check now", async () => {
    const store = createMemoryStore();
    await store.set("competitors", [acme]);
    const { api } = fakeContext({ monitors, runs: { mon_p: [run({})] } });
    await refresh(store, api.monitors, { now: at });
    await watchForResults(store, later(60_000));
    const saved = await loadSavedStates(store);
    expect(isDue(saved, later(3 * 60_000))).toBe(false);
    expect(isDue(saved, later(6 * 60_000))).toBe(true);
    expect(isDue(saved, later(25 * 60_000))).toBe(false);
  });

  it("keeps the last good states and tries again after a failure", async () => {
    const store = createMemoryStore();
    await store.set("competitors", [acme]);
    const ok = fakeContext({ monitors, runs: { mon_p: [run({})] } });
    await refresh(store, ok.api.monitors, { now: at });
    const broken = fakeContext();
    broken.api.monitors.list = async () => {
      throw new Error("down");
    };
    expect(await refresh(store, broken.api.monitors, { now: later(6 * 60 * 60_000) })).toEqual({ status: "failed" });
    const saved = await loadSavedStates(store);
    expect(saved).toMatchObject({ at: at.toISOString(), failedAt: later(6 * 60 * 60_000).toISOString() });
    expect(saved?.states.mon_p).toMatchObject({ state: "working" });
    expect(isDue(saved, later(6 * 60 * 60_000 + 2 * 60_000))).toBe(false);
    expect(isDue(saved, later(6 * 60 * 60_000 + 5 * 60_000))).toBe(true);
  });

  it("is due when it never ran, and says when the next run is", () => {
    expect(isDue(null, at)).toBe(true);
    expect(
      nextRun({ at: at.toISOString(), states: {}, failedAt: null, nextRuns: { a: "2026-11-09T12:00:00Z", b: "2026-11-09T09:00:00Z" } }, at),
    ).toBe("2026-11-09T12:00:00Z");
  });
});

describe("refresh guards", () => {
  it("runs once when two tabs ask at the same time", async () => {
    const store = createMemoryStore();
    await store.set("competitors", [acme]);
    const { api, listed } = fakeContext({ monitors: [{ id: "mon_p", status: "active" } as never], runs: { mon_p: [run({})] } });
    const [a, b] = await Promise.all([refresh(store, api.monitors), refresh(store, api.monitors)]);
    expect(a).toEqual(b);
    expect(listed).toHaveLength(1);
  });

  it("warns only when the last good check is over an hour old", () => {
    const now = new Date("2026-11-09T08:00:00Z");
    const saved = (at: string) => ({ at, states: {}, failedAt: "2026-11-09T07:59:00Z" });
    expect(showStaleWarning(saved("2026-11-09T07:30:00Z"), now)).toBe(false);
    expect(showStaleWarning(saved("2026-11-09T06:30:00Z"), now)).toBe(true);
    expect(showStaleWarning({ ...saved("2026-11-09T06:30:00Z"), failedAt: null }, now)).toBe(false);
  });
});

describe("competitor filter", () => {
  it("selects several competitors, and treats all of them as All", () => {
    const beta = { ...acme, slug: "beta", name: "Beta", domain: "beta.example", watches: {} };
    const gamma = { ...acme, slug: "gamma", name: "Gamma", domain: "gamma.example", watches: {} };
    const all = [acme, beta, gamma];
    expect(readFilter("beta,gamma", all)).toEqual(["beta", "gamma"]);
    expect(readFilter("beta,nobody,beta", all)).toEqual(["beta"]);
    expect(readFilter("acme-notes,beta,gamma", all)).toEqual([]);
    expect(readFilter(undefined, all)).toEqual([]);
  });
});

describe("earlier news on the Overview", () => {
  it("includes news from before a competitor was added", async () => {
    const store = createMemoryStore();
    const added = { ...acme, addedAt: "2026-11-09T00:00:00.000Z", watches: {} };
    await store.set(newsKey("acme-notes"), [{ ...fixtureNewsSearch.data[0], id: "early", published_at: "2026-10-28T06:00:00Z" }]);
    const data = await loadOverview(store, [added], new Map());
    expect(data.events.map((e) => e.id)).toEqual(["early"]);
  });
});

describe("date range", () => {
  const today = "2026-11-09";
  const earliest = "2026-08-12";
  it("defaults to the last 7 days", () => {
    expect(readRange(undefined, undefined, today, earliest)).toEqual({ from: "2026-11-03", to: today });
  });

  it("reads a custom range from the address", () => {
    expect(readRange("2026-09-14", "2026-10-02", today, earliest)).toEqual({ from: "2026-09-14", to: "2026-10-02" });
    expect(readRange("2026-10-02", "2026-10-02", today, earliest)).toEqual({ from: "2026-10-02", to: "2026-10-02" });
  });

  it("keeps the range between the earliest day and today", () => {
    expect(readRange("2026-01-01", "2027-01-01", today, earliest)).toEqual({ from: earliest, to: today });
    expect(readRange("2026-10-20", "2026-10-10", today, earliest)).toEqual({ from: "2026-10-10", to: "2026-10-10" });
    expect(readRange("garbage", "2026-13-45", today, earliest)).toEqual({ from: "2026-11-03", to: today });
    expect(readRange(undefined, "2026-10-10", today, earliest)).toEqual({ from: "2026-10-04", to: "2026-10-10" });
  });

  it("reaches 90 days back, or further when older changes are saved", () => {
    const at = (d: string) => ({ detectedAt: `${d}T08:00:00Z` }) as never;
    expect(earliestDay([], today)).toBe("2026-08-12");
    expect(earliestDay([at("2026-10-01")], today)).toBe("2026-08-12");
    expect(earliestDay([at("2026-05-02")], today)).toBe("2026-05-02");
  });
});
