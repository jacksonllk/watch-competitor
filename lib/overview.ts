/**
 * The Overview's data: every saved change of every watched competitor, and each watch's state.
 * Reads the store only. The page picks the range to show. Days are UTC.
 */
import { allWatches, type CompetitorRecord } from "./competitors";
import { articleToEvent, toEvent, type CompetitorEvent } from "./events";
import { historyToEvent, loadHistory } from "./changelog-history";
import { newsCheckKey, newsKey, oneStoryEach, relevantArticles, type Article, type NewsCheck } from "./news";
import type { Store } from "./store/types";
import { loadChanges } from "./sync";
import { newsState, type NamedState, type WatchState } from "./watch-status";

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const validDay = (day: string | undefined) => (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null);

/** A range of whole days, both ends included, as YYYY-MM-DD (UTC). */
export type DayRange = { from: string; to: string };

/** Without a range in the address, the Overview shows the last 30 days (11 Nov, Jackson): a new competitor brings 90 days of news and changelog, so it is never empty. */
export const DEFAULT_SPAN = 30;

/** The earliest day the Overview can show: 90 days back (the news and changelogs read at Add), or the oldest saved event. */
export function earliestDay(events: CompetitorEvent[], today: string): string {
  const floor = addDays(today, -89);
  const oldest = events.reduce((min, e) => (e.detectedAt.slice(0, 10) < min ? e.detectedAt.slice(0, 10) : min), floor);
  return oldest < floor ? oldest : floor;
}

/** The range in the address (from, to), kept between the earliest day and today. Default: the last 30 days. */
export function readRange(from: string | undefined, to: string | undefined, today: string, earliest: string): DayRange {
  let end = validDay(to) ?? today;
  if (end > today) end = today;
  if (end < earliest) end = earliest;
  let start = validDay(from) ?? addDays(end, -(DEFAULT_SPAN - 1));
  if (start > end) start = end;
  if (start < earliest) start = earliest;
  return { from: start, to: end };
}

/** "a,b" -> the watched slugs among them, once each. Selecting every competitor is the same as All (empty). */
export function readFilter(raw: string | undefined, watching: CompetitorRecord[]): string[] {
  const picked = [...new Set((raw ?? "").split(",").filter((slug) => watching.some((c) => c.slug === slug)))];
  return picked.length === watching.length ? [] : picked;
}

/** Monday of the week that holds `date`, as YYYY-MM-DD (UTC). */
export function mondayOf(date: Date): string {
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)).toISOString().slice(0, 10);
}

/** Low-importance changes are hidden, except Pricing: a missed price change costs more than a noisy one. */
export function isShown(event: CompetitorEvent): boolean {
  return event.kind === "pricing" || event.importance !== "low";
}

/**
 * Every saved event of one competitor, newest first: monitor changes, and news published after it was added.
 * With earlierNews, also the 90 days of news saved when it was added (the Overview shows those weeks too).
 */
export async function loadEvents(store: Store, competitor: CompetitorRecord, options: { earlierNews?: boolean } = {}): Promise<CompetitorEvent[]> {
  const [changes, articles, history] = await Promise.all([
    loadChanges(store, competitor.slug),
    store.get<Article[]>(newsKey(competitor.slug)).then((a) => oneStoryEach(relevantArticles(a ?? [], competitor.name, competitor.domain).articles, competitor.name)),
    options.earlierNews ? loadHistory(store, competitor.slug) : Promise.resolve([]),
  ]);
  const events = [
    ...changes.map((c) => toEvent(c, [competitor])).filter((e): e is CompetitorEvent => e !== null),
    ...articles
      .filter((a) => a.published_at && (options.earlierNews || a.published_at >= competitor.addedAt))
      .map((a) => articleToEvent(a, competitor)),
    ...history.map((h) => historyToEvent(h, competitor)),
  ];
  return events.filter(isShown).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export type CompetitorRow = {
  competitor: CompetitorRecord;
  colorIndex: number;
  watches: NamedState[];
};

export type OverviewData = {
  rows: CompetitorRow[];
  removed: CompetitorRecord[];
  /** Every saved event of the watched competitors, newest first. The page shows the chosen range of them. */
  events: CompetitorEvent[];
  watchesWorking: number;
  watchesTotal: number;
};

export async function loadOverview(store: Store, competitors: CompetitorRecord[], monitorStates: Map<string, WatchState>): Promise<OverviewData> {
  const watching = competitors.filter((c) => c.status === "watching").sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const rows: CompetitorRow[] = await Promise.all(
    watching.map(async (competitor, colorIndex) => {
      const check = await store.get<NewsCheck>(newsCheckKey(competitor.slug));
      const watches: NamedState[] = [];
      for (const w of allWatches(competitor)) {
        const state = monitorStates.get(w.monitorId) ?? { kind: w.kind, state: "unknown" as const, reason: "not read yet" };
        watches.push({ ...state, label: w.label });
      }
      if (competitor.news !== false) watches.push(newsState(check));
      return { competitor, colorIndex, watches };
    }),
  );
  const perCompetitor = await Promise.all(watching.map((c) => loadEvents(store, c, { earlierNews: true })));
  const all = rows.flatMap((r) => r.watches);
  return {
    rows,
    removed: competitors.filter((c) => c.status === "removed"),
    events: perCompetitor.flat().sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
    watchesWorking: all.filter((w) => w.state === "working").length,
    watchesTotal: all.length,
  };
}
