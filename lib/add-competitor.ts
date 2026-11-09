/**
 * The Add flow: find the pages, look up the brand, create the monitors, save the competitor,
 * then run its first News check. The Add panel and scripts/add-competitors.mts both call this.
 * Credits are counted from what the API reports on each response.
 */
import { APP_TAG, recordCall, USAGE_ROW, type ContextApi, type Usage } from "./context";
import { loadCompetitors, saveCompetitor, slugFor, type CompetitorRecord } from "./competitors";
import { findPages, type FetchHop, type FoundPages } from "./find-pages";
import { checkNews } from "./news";
import type { Store } from "./store/types";
import { startWatches } from "./watches";

export type AddResult =
  | {
      status: "added";
      competitor: CompetitorRecord;
      pages: FoundPages;
      /** Calls and credits per dashboard row, from what each response reported. */
      usage: Usage;
      /** First checks queued: 1 credit each, charged on the run (dashboard row /monitors/run). */
      firstChecks: number;
    }
  | { status: "already_watching"; competitor: CompetitorRecord }
  | { status: "no_monitor_slots"; used: number; limit: number; needed: number };

export async function addCompetitor(
  store: Store,
  api: ContextApi,
  input: { domain: string; focus?: string | null },
  options: { now?: Date; fetchHop?: FetchHop } = {},
): Promise<AddResult> {
  const now = options.now ?? new Date();
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const all = await loadCompetitors(store);
  const existing = all.find((c) => c.domain === domain && c.status === "watching");
  if (existing) return { status: "already_watching", competitor: existing };

  // Free: plain requests to the competitor's own site.
  const pages = await findPages(domain, options.fetchHop);
  const needed = [pages.pricing, pages.changelog].filter(Boolean).length;

  // Free: monitor management costs 0 credits. Paused monitors count too.
  const usage: Usage = {};
  const limits = await api.monitors.getLimits();
  recordCall(usage, USAGE_ROW.limits, limits);
  if (limits.monitors_used + needed > limits.monitors_limit) {
    return { status: "no_monitor_slots", used: limits.monitors_used, limit: limits.monitors_limit, needed };
  }

  const brand = await api.brand.search({ query: domain, queryBy: ["domain"], tags: [APP_TAG] });
  recordCall(usage, USAGE_ROW.brandSearch, brand);
  const match = brand.results.find((r) => r.domain.toLowerCase().replace(/^www\./, "") === domain);

  const name = match?.name || domain;
  const record: CompetitorRecord = {
    slug: slugFor(name, domain, all),
    name,
    domain,
    logo: match?.logo || null,
    description: match?.description ?? null,
    focus: input.focus ?? null,
    addedAt: now.toISOString(),
    status: "watching",
    removedAt: null,
    watches: {},
  };

  const started = await startWatches(
    api.monitors,
    record,
    { pricing: pages.pricing?.url, changelog: pages.changelog?.url },
    record.addedAt,
    usage,
  );
  record.watches = started.watches;
  // Save right after the monitors exist, so a later failure never leaves monitors the app does not know about.
  await saveCompetitor(store, record);

  await checkNews(store, api.news, record, now, usage);
  return { status: "added", competitor: record, pages, usage, firstChecks: Object.keys(record.watches).length };
}
