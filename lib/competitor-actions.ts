/**
 * What the competitor page can do: check now, add or remove a monitor, edit an address, remove, delete history.
 * Remove saves every change first, because deleting a monitor deletes context.dev's copy of its changes.
 */
import { allWatches, loadCompetitors, saveCompetitor, type CompetitorRecord } from "./competitors";
import { failureOf, recordCall, USAGE_ROW, type MonitorsApi, type Usage } from "./context";
import { newsCheckKey, newsKey } from "./news";
import type { Store } from "./store/types";
import { changesKey, syncChanges } from "./sync";
import { historyCheckKey, historyKey } from "./changelog-history";
import { loadSecrets, saveSecrets } from "./webhook";
import { monitorParams, startWatches, stopWatches, type ExtraPage, type MonitorOptions } from "./watches";

export async function findCompetitor(store: Store, slug: string): Promise<CompetitorRecord | null> {
  return (await loadCompetitors(store)).find((c) => c.slug === slug) ?? null;
}

/** Runs each page monitor now. 1 credit per page, charged on the run. */
export async function checkNow(
  store: Store,
  api: MonitorsApi,
  slug: string,
): Promise<{ status: "started"; pages: number; usage: Usage } | { status: "not_found" | "not_watching" }> {
  const competitor = await findCompetitor(store, slug);
  if (!competitor) return { status: "not_found" };
  if (competitor.status !== "watching") return { status: "not_watching" };
  const usage: Usage = {};
  const watches = allWatches(competitor);
  for (const watch of watches) recordCall(usage, USAGE_ROW.runNow, await api.run(watch.monitorId));
  return { status: "started", pages: watches.length, usage };
}

/** Saves every change, deletes the monitors (free), and keeps the competitor as "No longer watched". */
export async function removeCompetitor(
  store: Store,
  api: MonitorsApi,
  slug: string,
  now: Date = new Date(),
): Promise<{ status: "removed"; competitor: CompetitorRecord } | { status: "not_found" | "not_watching" }> {
  const competitor = await findCompetitor(store, slug);
  if (!competitor) return { status: "not_found" };
  if (competitor.status !== "watching") return { status: "not_watching" };
  await syncChanges(store, api);
  await stopWatches(api, competitor);
  const removed: CompetitorRecord = { ...competitor, status: "removed", removedAt: now.toISOString() };
  await saveCompetitor(store, removed);
  return { status: "removed", competitor: removed };
}

/** Deletes a removed competitor and everything saved about it. Only for removed competitors. */
export async function deleteHistory(store: Store, slug: string): Promise<{ status: "deleted" | "not_found" | "still_watching" }> {
  const all = await loadCompetitors(store);
  const competitor = all.find((c) => c.slug === slug);
  if (!competitor) return { status: "not_found" };
  if (competitor.status === "watching") return { status: "still_watching" };
  await Promise.all([
    store.delete(changesKey(slug)),
    store.delete(newsKey(slug)),
    store.delete(newsCheckKey(slug)),
    store.delete(historyKey(slug)),
    store.delete(historyCheckKey(slug)),
  ]);
  // The deleted monitors' webhook secrets are no longer needed.
  const secrets = await loadSecrets(store);
  const ids = allWatches(competitor).map((w) => w.monitorId);
  if (ids.some((id) => id && secrets[id])) {
    await saveSecrets(store, Object.fromEntries(Object.entries(secrets).filter(([id]) => !ids.includes(id))));
  }
  await store.set(
    "competitors",
    all.filter((c) => c.slug !== slug),
  );
  return { status: "deleted" };
}

/**
 * Edit address: points one page monitor at a new address, for a page that moved or was not found.
 * context.dev replaces the target, discards the old baseline and runs a new one (1 credit, reports no change).
 * Setting it active also resumes a monitor that paused itself after failing. The address is checked by the caller.
 */
export async function editAddress(
  store: Store,
  api: MonitorsApi,
  slug: string,
  monitorId: string,
  url: string,
  options: MonitorOptions = {},
): Promise<{ status: "updated"; competitor: CompetitorRecord } | { status: "not_found" | "not_watching" }> {
  const competitor = await findCompetitor(store, slug);
  if (!competitor) return { status: "not_found" };
  if (competitor.status !== "watching") return { status: "not_watching" };
  const watch = allWatches(competitor).find((w) => w.monitorId === monitorId);
  if (!watch) return { status: "not_found" };
  const { target } = monitorParams(competitor, watch.kind, url, options, watch.label, watch.page);
  await api.update(monitorId, { target, status: "active" });
  const mainKind = watch.kind !== "page" && competitor.watches[watch.kind]?.monitorId === monitorId ? watch.kind : null;
  const updated: CompetitorRecord = mainKind
    ? { ...competitor, watches: { ...competitor.watches, [mainKind]: { ...competitor.watches[mainKind]!, url } } }
    : { ...competitor, extra: (competitor.extra ?? []).map((w) => (w.monitorId === monitorId ? { ...w, url } : w)) };
  await saveCompetitor(store, updated);
  return { status: "updated", competitor: updated };
}

/**
 * Add monitors on the competitor page: one new monitor per page, watched from today. Checks the free monitor slots first.
 * Creating is free. Each first check costs 1 credit on its run. Addresses are checked by the caller.
 */
export async function addMonitors(
  store: Store,
  api: MonitorsApi,
  slug: string,
  pages: ExtraPage[],
  options: MonitorOptions = {},
  now: Date = new Date(),
): Promise<
  | { status: "added"; competitor: CompetitorRecord; count: number }
  | { status: "no_monitor_slots"; used: number; limit: number; needed: number }
  | { status: "not_found" | "not_watching" | "already_watched" }
> {
  const competitor = await findCompetitor(store, slug);
  if (!competitor) return { status: "not_found" };
  if (competitor.status !== "watching") return { status: "not_watching" };
  const watched = new Set(allWatches(competitor).map((w) => w.url));
  const fresh = pages.filter((p, i) => !watched.has(p.url) && pages.findIndex((q) => q.url === p.url) === i);
  if (!fresh.length) return { status: "already_watched" };
  const limits = await api.getLimits();
  if (limits.monitors_used + fresh.length > limits.monitors_limit) {
    return { status: "no_monitor_slots", used: limits.monitors_used, limit: limits.monitors_limit, needed: fresh.length };
  }
  // A pricing page or changelog fills the main slot when it is empty, for example after the user removed it.
  const main: Partial<Record<"pricing" | "changelog", string>> = {};
  const extra = fresh.filter((p) => {
    if (p.kind === "page" || competitor.watches[p.kind] || main[p.kind]) return true;
    main[p.kind] = p.url;
    return false;
  });
  const started = await startWatches(api, competitor, main, now.toISOString(), {}, options, extra);
  if (Object.keys(started.secrets).length) await saveSecrets(store, { ...(await loadSecrets(store)), ...started.secrets });
  const updated: CompetitorRecord = {
    ...competitor,
    watches: { ...competitor.watches, ...started.watches },
    extra: [...(competitor.extra ?? []), ...started.extra],
  };
  await saveCompetitor(store, updated);
  return { status: "added", competitor: updated, count: fresh.length };
}

/**
 * Remove one monitor on the competitor page. Saves every change first, because deleting a monitor deletes
 * context.dev's copy of its changes. The changes it found stay on the timeline. Deleting is free.
 */
export async function removeMonitor(
  store: Store,
  api: MonitorsApi,
  slug: string,
  monitorId: string,
  now: Date = new Date(),
): Promise<{ status: "removed"; competitor: CompetitorRecord } | { status: "not_found" | "not_watching" }> {
  const competitor = await findCompetitor(store, slug);
  if (!competitor) return { status: "not_found" };
  if (competitor.status !== "watching") return { status: "not_watching" };
  const watch = allWatches(competitor).find((w) => w.monitorId === monitorId);
  if (!watch) return { status: "not_found" };
  await syncChanges(store, api);
  try {
    await api.delete(monitorId);
  } catch (error) {
    // Already deleted in context.dev, for example from its dashboard: nothing left to stop.
    if (failureOf(error).status !== 404) throw error;
  }
  const mainKind = watch.kind !== "page" && competitor.watches[watch.kind]?.monitorId === monitorId ? watch.kind : null;
  const watches = { ...competitor.watches };
  if (mainKind) delete watches[mainKind];
  const updated: CompetitorRecord = {
    ...competitor,
    watches,
    ...(mainKind ? {} : { extra: (competitor.extra ?? []).map((w) => (w.monitorId === monitorId ? { ...w, removedAt: now.toISOString() } : w)) }),
  };
  await saveCompetitor(store, updated);
  const secrets = await loadSecrets(store);
  if (secrets[monitorId]) {
    const { [monitorId]: _gone, ...rest } = secrets; // eslint-disable-line @typescript-eslint/no-unused-vars
    await saveSecrets(store, rest);
  }
  return { status: "removed", competitor: updated };
}
