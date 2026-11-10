/** The competitor page's data, from the store only. */
import { allWatches, loadCompetitors, MAIN_LABEL, type CompetitorRecord } from "./competitors";
import { articleToEvent, filterKey, type CompetitorEvent, type EventKind } from "./events";
import { historyToEvent, loadHistory } from "./changelog-history";
import { newsCheckKey, newsKey, oneStoryEach, relevantArticles, type Article, type NewsCheck } from "./news";
import { loadEvents } from "./overview";
import type { SavedStates } from "./refresh";
import type { PageType } from "./page-types";
import type { Store } from "./store/types";
import { newsState, type WatchState } from "./watch-status";

/** state is null for a page the user chose not to watch. */
/** One watch on the competitor page. label: "Pricing", "Changelog", "News" or an extra page's name. monitorId: page watches only. */
export type WatchRow = { kind: EventKind; url: string | null; state: WatchState | null; label: string; monitorId?: string; page?: PageType };

export type CompetitorPage = {
  competitor: CompetitorRecord;
  colorIndex: number;
  watches: WatchRow[];
  /** Changes and news since it was added, newest first, for the chosen kind. */
  events: CompetitorEvent[];
  /** How many changes the page lists in all, since adding and the 90 days before. */
  total: number;
  /**
   * One filter per tag, in this order: Features, Pricing, News (always), then each extra page watched, then any other
   * tag with changes (a removed page). key goes in ?k=. Named after the tag, never lumped into one "Other pages".
   */
  filters: { key: string; label: string; count: number }[];
  /** News from the 90 days before it was added, newest first. */
  before: CompetitorEvent[];
  lastChecked: string | null;
  nextCheck: string | null;
  /** True while any page watch has not finished its first check. */
  settingUp: boolean;
  /** True once a page watch has compared the page at least once. */
  compared: boolean;
  /** The chosen filter's key, or null for All. */
  filter: string | null;
};

const MAIN_FILTERS = [
  { key: "changelog", label: "Features" },
  { key: "pricing", label: "Pricing" },
  { key: "news", label: "News" },
];

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
  const colorIndex = Math.max(
    0,
    watching.findIndex((c) => c.slug === slug),
  );

  const [check, articles, events, history] = await Promise.all([
    store.get<NewsCheck>(newsCheckKey(slug)),
    // The relevance check also runs on news saved before it existed (9 Nov).
    store
      .get<Article[]>(newsKey(slug))
      .then((a) => oneStoryEach(relevantArticles(a ?? [], competitor.name, competitor.domain).articles, competitor.name)),
    loadEvents(store, competitor),
    loadHistory(store, slug),
  ]);

  // The pricing page and changelog always show, watched or not. Extra pages show when there are any.
  const monitors = allWatches(competitor);
  const watches: WatchRow[] = (["changelog", "pricing"] as const).map((kind) => {
    const watch = competitor.watches[kind];
    if (!watch) return { kind, url: null, state: null, label: MAIN_LABEL[kind] };
    return {
      kind,
      url: watch.url,
      label: MAIN_LABEL[kind],
      monitorId: watch.monitorId,
      state: saved?.states[watch.monitorId] ?? { kind, state: "unknown", reason: "Checking status" },
    };
  });
  const extra = (competitor.extra ?? []).filter((w) => !w.removedAt);
  for (const w of extra) {
    watches.push({
      kind: w.kind,
      url: w.url,
      label: w.label,
      monitorId: w.monitorId,
      ...(w.page ? { page: w.page } : {}),
      state: saved?.states[w.monitorId] ?? { kind: w.kind, state: "unknown", reason: "Checking status" },
    });
  }
  watches.push({ kind: "news", url: null, label: "News", state: competitor.news === false ? null : newsState(check) });

  const times = (pick: (w: WatchState) => string | null) =>
    watches
      .map((w) => (w.state ? pick(w.state) : null))
      .filter((t): t is string => Boolean(t))
      .sort();
  const lastChecked = times((w) => (w.state === "working" ? w.lastChecked : null)).at(-1) ?? null;
  const nextCheck =
    monitors
      .map((w) => saved?.nextRuns?.[w.monitorId])
      .filter((t): t is string => Boolean(t))
      .sort()[0] ?? null;

  const pageWatches = watches.filter((w) => w.kind !== "news" && w.url);
  const earlier = [
    ...articles.filter((a) => a.published_at && a.published_at < competitor.addedAt).map((a) => articleToEvent(a, competitor)),
    ...history.map((h) => historyToEvent(h, competitor)),
  ];
  // The chips count everything the page lists: changes since adding and the 90 days before.
  const listed = [...events, ...earlier];
  const count = new Map<string, number>();
  for (const e of listed) count.set(filterKey(e), (count.get(filterKey(e)) ?? 0) + 1);
  const filters = MAIN_FILTERS.map((f) => ({ ...f, count: count.get(f.key) ?? 0 }));
  const add = (key: string, label: string) => {
    if (!filters.some((f) => f.key === key)) filters.push({ key, label, count: count.get(key) ?? 0 });
  };
  for (const w of extra) add(filterKey(w), w.label);
  for (const e of listed.filter((e) => e.label).sort((a, b) => a.label!.localeCompare(b.label!))) add(filterKey(e), e.label!);
  const filter = filters.some((f) => f.key === options.kind) ? options.kind! : null;
  const chosen = (e: CompetitorEvent) => !filter || filterKey(e) === filter;

  return {
    competitor,
    colorIndex,
    watches,
    events: events.filter(chosen),
    total: listed.length,
    filters,
    before: earlier.filter(chosen).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
    lastChecked,
    nextCheck,
    settingUp: pageWatches.some((w) => w.state?.state === "setting_up"),
    compared: pageWatches.some((w) => w.state?.state === "working" && w.state.compared),
    filter,
  };
}
