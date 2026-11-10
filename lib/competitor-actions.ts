/**
 * What the competitor page can do: check now, remove, delete history.
 * Remove saves every change first, because deleting a monitor deletes context.dev's copy of its changes.
 */
import { loadCompetitors, saveCompetitor, type CompetitorRecord } from "./competitors";
import { recordCall, USAGE_ROW, type MonitorsApi, type Usage } from "./context";
import { newsCheckKey, newsKey } from "./news";
import type { Store } from "./store/types";
import { changesKey, syncChanges } from "./sync";
import { historyKey } from "./changelog-history";
import { loadSecrets, saveSecrets } from "./webhook";
import { stopWatches } from "./watches";

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
  const watches = Object.values(competitor.watches).filter(Boolean);
  for (const watch of watches) recordCall(usage, USAGE_ROW.runNow, await api.run(watch!.monitorId));
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
  ]);
  // The deleted monitors' webhook secrets are no longer needed.
  const secrets = await loadSecrets(store);
  const ids = Object.values(competitor.watches).map((w) => w?.monitorId);
  if (ids.some((id) => id && secrets[id])) {
    await saveSecrets(store, Object.fromEntries(Object.entries(secrets).filter(([id]) => !ids.includes(id))));
  }
  await store.set(
    "competitors",
    all.filter((c) => c.slug !== slug),
  );
  return { status: "deleted" };
}
