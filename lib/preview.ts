/**
 * The Add panel's lookups before anything is watched: company search and the preview
 * (90 days of news and the site scan). Results are cached for 24 hours in the store.
 * A daily credit cap, PREVIEW_DAILY_CREDIT_CAP (default 15), stops the paid calls.
 * Credits are counted from what each response reports.
 */
import type { BrandApi, ContextApi, Usage } from "./context";
import { APP_TAG, creditsOf, failureOf, recordCall, USAGE_ROW } from "./context";
import { findPages, type FetchHop, type FoundPages } from "./find-pages";
import { keepArticles, relevantArticles, searchNews, type Article, type NewsCheck } from "./news";
import type { Store } from "./store/types";

export type Company = { name: string; domain: string; logo: string | null; description: string | null };

export type Preview = {
  company: Company;
  /** Articles mainly about the company in the 90 days before the preview, one per story, newest first. */
  articles: Article[];
  news: { ok: boolean; reason: NewsCheck["reason"] };
  pages: FoundPages;
  /** When the news was fetched. The first daily News check continues from here. */
  at: string;
};

export type Spent = { credits: number; usage: Usage };
export type Failure = { status: "cap_reached"; cap: number } | { status: "out_of_credits"; nextRefillAt: string | null } | { status: "failed" };

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_SECONDS = 24 * 60 * 60;
export const DEFAULT_CAP = 15;

export const searchKey = (by: "name" | "domain", query: string) => `preview:search:${by}:${query}`;
export const previewKey = (domain: string) => `preview:${domain}`;
export const capKey = (now: Date) => `preview:credits:${now.toISOString().slice(0, 10)}`;

export function dailyCap(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.PREVIEW_DAILY_CREDIT_CAP);
  return env.PREVIEW_DAILY_CREDIT_CAP && Number.isInteger(value) && value >= 0 ? value : DEFAULT_CAP;
}

/** "https://www.Acme.com/pricing" -> "acme.com". */
export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
}

/** True for input that looks like a domain, such as "modal.com". */
export function looksLikeDomain(input: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalizeDomain(input));
}

async function spentToday(store: Store, now: Date): Promise<number> {
  return (await store.get<number>(capKey(now))) ?? 0;
}

async function addSpent(store: Store, now: Date, credits: number): Promise<void> {
  if (!credits) return;
  const total = (await spentToday(store, now)) + credits;
  // Kept 2 days so the key outlives the UTC day it counts.
  await store.set(capKey(now), total, { ttlSeconds: 2 * CACHE_SECONDS });
}

function toCompany(result: { name: string; domain: string; logo?: string | null; description?: string | null }): Company {
  const domain = normalizeDomain(result.domain);
  return { name: result.name || domain, domain, logo: result.logo || null, description: result.description || null };
}

async function brandSearch(
  api: BrandApi,
  by: "name" | "domain",
  query: string,
  usage: Usage,
): Promise<{ ok: true; companies: Company[]; credits: number } | Failure> {
  try {
    const res = await api.search({ query, queryBy: [by], autocomplete: by === "name", tags: [APP_TAG] });
    recordCall(usage, USAGE_ROW.brandSearch, res);
    const seen = new Set<string>();
    const companies = res.results
      .filter((r) => r.domain)
      .map(toCompany)
      .filter((c) => !seen.has(c.domain) && seen.add(c.domain));
    return { ok: true, companies, credits: creditsOf(res) };
  } catch (error) {
    const failure = failureOf(error);
    return failure.status === 402 ? { status: "out_of_credits", nextRefillAt: failure.nextRefillAt } : { status: "failed" };
  }
}

/** Companies matching a name or a domain. 1 credit per search on the Free plan, 0 when cached. */
export async function searchCompanies(
  store: Store,
  api: ContextApi,
  rawQuery: string,
  options: { now?: Date; cap?: number } = {},
): Promise<{ status: "ok"; companies: Company[]; spent: Spent; cached: boolean } | Failure> {
  const now = options.now ?? new Date();
  const cap = options.cap ?? dailyCap();
  const by = looksLikeDomain(rawQuery) ? "domain" : "name";
  const query = by === "domain" ? normalizeDomain(rawQuery) : rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
  const usage: Usage = {};
  if (query.length < 2) return { status: "ok", companies: [], spent: { credits: 0, usage }, cached: true };

  const cached = await store.get<Company[]>(searchKey(by, query));
  if (cached) return { status: "ok", companies: cached, spent: { credits: 0, usage }, cached: true };
  if ((await spentToday(store, now)) >= cap) return { status: "cap_reached", cap };

  const found = await brandSearch(api.brand, by, query, usage);
  if (!("ok" in found)) return found;
  await addSpent(store, now, found.credits);
  await store.set(searchKey(by, query), found.companies, { ttlSeconds: CACHE_SECONDS });
  return { status: "ok", companies: found.companies, spent: { credits: found.credits, usage }, cached: false };
}

/**
 * Description, 90 days of news and the pages found on the site, for one company.
 * Reuses the company from a cached search when there is one. Otherwise 1 Brand search by domain.
 * News: 1 credit per 10 articles. The site scan is free.
 */
export async function previewCompany(
  store: Store,
  api: ContextApi,
  rawDomain: string,
  options: { now?: Date; cap?: number; fetchHop?: FetchHop; query?: string } = {},
): Promise<{ status: "ok"; preview: Preview; spent: Spent; cached: boolean } | Failure> {
  const now = options.now ?? new Date();
  const cap = options.cap ?? dailyCap();
  const domain = normalizeDomain(rawDomain);
  const usage: Usage = {};
  const cached = await store.get<Preview>(previewKey(domain));
  if (cached) return { status: "ok", preview: checkedNews(cached), spent: { credits: 0, usage }, cached: true };
  if ((await spentToday(store, now)) >= cap) return { status: "cap_reached", cap };

  let credits = 0;
  let company = await companyFromSearchCache(store, domain, options.query);
  if (!company) {
    const found = await brandSearch(api.brand, "domain", domain, usage);
    if (!("ok" in found)) return found;
    credits += found.credits;
    company = found.companies.find((c) => c.domain === domain) ?? { name: domain, domain, logo: null, description: null };
  }

  const news = await searchNews(api.news, domain, now.getTime() - 90 * DAY_MS, usage);
  credits += news.credits;
  await addSpent(store, now, credits);
  if (!news.ok && news.reason === "out_of_credits") return { status: "out_of_credits", nextRefillAt: news.nextRefillAt };

  const pages = await findPages(domain, options.fetchHop);
  const relevant = news.ok ? relevantArticles(keepArticles([], news.articles), company.name, domain) : null;
  const preview: Preview = {
    company,
    articles: relevant?.articles ?? [],
    news: news.ok ? { ok: true, reason: null } : { ok: false, reason: news.reason },
    pages,
    at: now.toISOString(),
  };
  // A failed news call is not cached, so the next preview tries again.
  if (news.ok || news.reason === "no_news_source") await store.set(previewKey(domain), preview, { ttlSeconds: CACHE_SECONDS });
  return { status: "ok", preview, spent: { credits, usage }, cached: false };
}

async function companyFromSearchCache(store: Store, domain: string, query?: string): Promise<Company | null> {
  const keys = [searchKey("domain", domain)];
  if (query) keys.push(searchKey("name", query.trim().toLowerCase().replace(/\s+/g, " ")));
  for (const key of keys) {
    const companies = await store.get<Company[]>(key);
    const match = companies?.find((c) => c.domain === domain);
    if (match) return match;
  }
  return null;
}

/** Applies the news rule to a preview saved before the rule existed. Free: no new search. */
function checkedNews(preview: Preview): Preview {
  if (!preview.news.ok) return preview;
  const relevant = relevantArticles(preview.articles, preview.company.name, preview.company.domain);
  return { ...preview, articles: relevant.articles };
}
