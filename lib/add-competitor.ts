/**
 * The Add flow: use the pages the user confirmed (or scan the site), reuse the preview's company and news
 * when it is cached, create the monitors, save the competitor, then save its news.
 * Credits are counted from what the API reports on each response.
 */
import { APP_TAG, recordCall, USAGE_ROW, type ContextApi, type Usage } from "./context";
import { allWatches, loadCompetitors, saveCompetitor, slugFor, type CompetitorRecord } from "./competitors";
import { findPages, type FetchHop, type PageKind } from "./find-pages";
import { checkNews, newsCheckKey, newsKey, relevantArticles, type NewsCheck } from "./news";
import { normalizeDomain, previewKey, type Preview } from "./preview";
import type { Store } from "./store/types";
import { startWatches, type ExtraPage, type MonitorOptions } from "./watches";
import { loadSecrets, saveSecrets } from "./webhook";

export type AddInput = {
  domain: string;
  focus?: string | null;
  /** False: watch without news (no daily news search). Default true. */
  news?: boolean;
  /** Pages the user confirmed. A missing kind means "scan the site". null means "watch without it". */
  pages?: Partial<Record<PageKind, string | null>>;
  /** Extra pages from Add more monitors, each its own monitor. Addresses already checked. */
  more?: ExtraPage[];
};

export type AddResult =
  | {
      status: "added";
      competitor: CompetitorRecord;
      /** Calls and credits per dashboard row, from what each response reported. */
      usage: Usage;
      /** First checks queued: 1 credit each, charged on the run (dashboard row /monitors/run). */
      firstChecks: number;
    }
  | { status: "already_watching"; competitor: CompetitorRecord }
  | { status: "no_monitor_slots"; used: number; limit: number; needed: number };

export const FOCUS_LIMIT = 300;

export async function addCompetitor(
  store: Store,
  api: ContextApi,
  input: AddInput,
  options: { now?: Date; fetchHop?: FetchHop } & MonitorOptions = {},
): Promise<AddResult> {
  const now = options.now ?? new Date();
  const domain = normalizeDomain(input.domain);
  const focus = input.focus?.trim().replace(/\s+/g, " ").slice(0, FOCUS_LIMIT) || null;
  const all = await loadCompetitors(store);
  const existing = all.find((c) => c.domain === domain && c.status === "watching");
  if (existing) return { status: "already_watching", competitor: existing };

  const saved = await store.get<Preview>(previewKey(domain));
  // The same news rule as the preview, also for previews saved before the rule.
  const preview = saved?.news.ok ? { ...saved, ...newsVerdict(saved) } : saved;
  const pages = await chosenPages(domain, input.pages, preview, options.fetchHop);
  const more = input.more ?? [];
  const needed = Object.values(pages).filter(Boolean).length + more.length;

  // Free: monitor management costs 0 credits. Paused monitors count too.
  const usage: Usage = {};
  const limits = await api.monitors.getLimits();
  recordCall(usage, USAGE_ROW.limits, limits);
  if (limits.monitors_used + needed > limits.monitors_limit) {
    return { status: "no_monitor_slots", used: limits.monitors_used, limit: limits.monitors_limit, needed };
  }

  let company = preview?.company ?? null;
  if (!company) {
    const brand = await api.brand.search({ query: domain, queryBy: ["domain"], tags: [APP_TAG] });
    recordCall(usage, USAGE_ROW.brandSearch, brand);
    const match = brand.results.find((r) => normalizeDomain(r.domain) === domain);
    company = { name: match?.name || domain, domain, logo: match?.logo || null, description: match?.description || null };
  }

  const record: CompetitorRecord = {
    slug: slugFor(company.name, domain, all),
    name: company.name,
    domain,
    logo: company.logo,
    description: company.description,
    focus,
    ...(input.news === false ? { news: false } : {}),
    addedAt: now.toISOString(),
    status: "watching",
    removedAt: null,
    watches: {},
  };

  const started = await startWatches(
    api.monitors,
    record,
    pages,
    record.addedAt,
    usage,
    { instructions: options.instructions, schedule: options.schedule, webhookUrl: options.webhookUrl },
    more,
  );
  if (Object.keys(started.secrets).length) await saveSecrets(store, { ...(await loadSecrets(store)), ...started.secrets });
  record.watches = started.watches;
  if (started.extra.length) record.extra = started.extra;
  // Save right after the monitors exist, so a later failure never leaves monitors the app does not know about.
  await saveCompetitor(store, record);

  if (input.news === false) {
    // No news watch: nothing saved, no daily search.
  } else if (preview?.news.ok || preview?.news.reason === "no_news_source") {
    // The preview already paid for 90 days of news. The daily check continues from the preview's time.
    await store.set(newsKey(record.slug), preview.articles);
    const check: NewsCheck = { at: preview.at, ok: preview.news.ok, reason: preview.news.reason, nextRefillAt: null };
    await store.set(newsCheckKey(record.slug), check);
  } else {
    await checkNews(store, api.news, record, now, usage);
  }
  return { status: "added", competitor: record, usage, firstChecks: allWatches(record).length };
}

/** The confirmed pages, else the preview's scan, else a fresh scan (free: plain requests to their site). */
async function chosenPages(
  domain: string,
  confirmed: AddInput["pages"],
  preview: Preview | null,
  fetchHop?: FetchHop,
): Promise<Partial<Record<PageKind, string>>> {
  const kinds: PageKind[] = ["pricing", "changelog"];
  const needScan = kinds.some((k) => confirmed?.[k] === undefined) && !preview;
  const scanned = needScan ? await findPages(domain, fetchHop) : preview?.pages;
  const pages: Partial<Record<PageKind, string>> = {};
  for (const kind of kinds) {
    const url = confirmed?.[kind] === undefined ? scanned?.[kind]?.url : confirmed[kind];
    if (url) pages[kind] = url;
  }
  return pages;
}

function newsVerdict(preview: Preview): Pick<Preview, "articles" | "news"> {
  const relevant = relevantArticles(preview.articles, preview.company.name, preview.company.domain);
  return { articles: relevant.articles, news: preview.news };
}
