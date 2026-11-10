/** The competitor page's data, from the store only. */
import { loadCompetitors, type CompetitorRecord } from "./competitors";
import { articleToEvent, type CompetitorEvent, type EventKind } from "./events";
import { historyToEvent, loadHistory } from "./changelog-history";
import { newsCheckKey, newsKey, oneStoryEach, relevantArticles, type Article, type NewsCheck } from "./news";
import { loadEvents } from "./overview";
import type { SavedStates } from "./refresh";
import type { Store } from "./store/types";
import { newsState, type WatchState } from "./watch-status";

/** state is null for a page the user chose not to watch. */
export type WatchRow = { kind: EventKind; url: string | null; state: WatchState | null };

export type CompetitorPage = {
  competitor: CompetitorRecord;
  colorIndex: number;
  watches: WatchRow[];
  /** Changes and news since it was added, newest first, for the chosen kind. */
  events: CompetitorEvent[];
  counts: Record<EventKind | "all", number>;
  /** News from the 90 days before it was added, newest first. */
  before: CompetitorEvent[];
  lastChecked: string | null;
  nextCheck: string | null;
  /** True while any page watch has not finished its first check. */
  settingUp: boolean;
  /** True once a page watch has compared the page at least once. */
  compared: boolean;
  kind: EventKind | null;
};

const KINDS: EventKind[] = ["changelog", "pricing", "news"];

export async function loadCompetitorPage(
  store: Store,
  slug: string,
  saved: SavedStates | null,
  options: { kind?: string } = {},
): Promise<CompetitorPage | null> {
  const all = await loadCompetitors(store);
  const competitor = all.find((c) => c.slug === slug);
  if (!competitor) return null;
  const watching = all.filter((c) => c.status === "watching").sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const colorIndex = Math.max(0, watching.findIndex((c) => c.slug === slug));

  const [check, articles, events, history] = await Promise.all([
    store.get<NewsCheck>(newsCheckKey(slug)),
    // The relevance check also runs on news saved before it existed (9 Nov).
    store.get<Article[]>(newsKey(slug)).then((a) => oneStoryEach(relevantArticles(a ?? [], competitor.name, competitor.domain).articles)),
    loadEvents(store, competitor),
    loadHistory(store, slug),
  ]);

  const watches: WatchRow[] = (["changelog", "pricing"] as const).map((kind) => {
    const watch = competitor.watches[kind];
    if (!watch) return { kind, url: null, state: null };
    return { kind, url: watch.url, state: saved?.states[watch.monitorId] ?? { kind, state: "unknown", reason: "Checking status" } };
  });
  watches.push({ kind: "news", url: null, state: competitor.news === false ? null : newsState(check) });

  const times = (pick: (w: WatchState) => string | null) =>
    watches
      .map((w) => (w.state ? pick(w.state) : null))
      .filter((t): t is string => Boolean(t))
      .sort();
  const lastChecked = times((w) => (w.state === "working" ? w.lastChecked : null)).at(-1) ?? null;
  const nextCheck =
    Object.values(competitor.watches)
      .map((w) => (w ? saved?.nextRuns?.[w.monitorId] : null))
      .filter((t): t is string => Boolean(t))
      .sort()[0] ?? null;

  const pageWatches = watches.filter((w) => w.kind !== "news" && w.url);
  const kind = KINDS.includes(options.kind as EventKind) ? (options.kind as EventKind) : null;
  const earlier = [
    ...articles.filter((a) => a.published_at && a.published_at < competitor.addedAt).map((a) => articleToEvent(a, competitor)),
    ...history.map((h) => historyToEvent(h, competitor)),
  ];
  // The chips count everything the page lists: changes since adding and the 90 days before.
  const counts = { all: events.length + earlier.length, changelog: 0, pricing: 0, news: 0 };
  for (const e of [...events, ...earlier]) counts[e.kind]++;

  return {
    competitor,
    colorIndex,
    watches,
    events: kind ? events.filter((e) => e.kind === kind) : events,
    counts,
    before: earlier
      .filter((e) => !kind || e.kind === kind)
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
    lastChecked,
    nextCheck,
    settingUp: pageWatches.some((w) => w.state?.state === "setting_up"),
    compared: pageWatches.some((w) => w.state?.state === "working" && w.state.compared),
    kind,
  };
}
