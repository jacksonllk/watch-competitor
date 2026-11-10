/**
 * The News watch: one News search by domain per competitor per day. Not a monitor.
 * 1 credit per 10 articles. Keeps articles mainly about the company (match.level primary),
 * one per story.
 */
import type { NewsSearchResponse } from "context.dev/resources";
import { APP_TAG, creditsOf, failureOf, recordCall, USAGE_ROW, type NewsApi, type Usage } from "./context";
import type { CompetitorRecord } from "./competitors";
import type { Store } from "./store/types";

export type Article = NewsSearchResponse.Data;
/** The last News check for one competitor, for its Working or Not working line. */
export type NewsCheck = {
  at: string;
  ok: boolean;
  /** Why it did not work: "no_news_source" (404), "out_of_credits" (402) or "failed". */
  reason: "no_news_source" | "out_of_credits" | "failed" | null;
  nextRefillAt: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 3;

export const newsKey = (slug: string) => `news:${slug}`;
export const newsCheckKey = (slug: string) => `newscheck:${slug}`;

/** Below this share of articles naming the company, the News API matched the wrong company. */
export const TRUST_SHARE = 0.5;

/**
 * The News API finds a company's news by matching its domain to a company in its own index, and for small companies
 * with a common-word name it can match the wrong one (9 Nov: boat.dev matched boAt, an electronics brand).
 * Keeps articles that name the company with its exact capitalisation, or its domain. When fewer than half do,
 * the whole result is about another company: trusted is false and nothing is kept, the same as finding no news.
 * A quoted-domain search ("boat.dev") was tested on 9 Nov and found only passing mentions in other companies' stories,
 * so it is not used.
 * Checked offline on 9 Nov: E2B 2 of 2, Daytona 9 of 10, Modal 7 of 8 kept, boat.dev 1 of 9. The share is unverified beyond these.
 */
export function relevantArticles(articles: Article[], name: string, domain: string): { articles: Article[]; trusted: boolean } {
  if (!articles.length) return { articles, trusted: true };
  const word = new RegExp(`(?<![A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`);
  const kept = articles.filter((a) => {
    const text = `${a.title} ${a.description ?? ""}`;
    return word.test(text) || text.toLowerCase().includes(domain.toLowerCase());
  });
  const trusted = kept.length / articles.length >= TRUST_SHARE;
  return { articles: trusted ? kept : [], trusted };
}

/**
 * The same story told twice: the same day and titles that start alike (9 Nov: two Business Wire releases about E2B on
 * 5 Nov, and two copies of one Daytona headline, each with its own story_id).
 */
export const storyKey = (a: Article) =>
  `${(a.published_at ?? "").slice(0, 10)} ${a.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 40)}`;

const STORY_DAYS = 3;
const STOP = new Set(
  "about after again against also from have into more over said says than that their them then there these they this with will would what when where which while your just".split(
    " ",
  ),
);
/** Money amounts in a headline, such as "$60m" and "$1b" from "$60M at a $1B valuation". */
const amounts = (title: string) =>
  new Set(
    (title.toLowerCase().match(/\$\s?\d[\d.,]*\s?(?:k|m|b|bn|million|billion)?\b/g) ?? []).map((m) =>
      m
        .replace(/\s|,/g, "")
        .replace("million", "m")
        .replace(/billion|bn/, "b"),
    ),
  );
/** Words that carry a headline's meaning: 4 letters or more, not common words, not the company's own name. */
const keyWords = (title: string, skip: Set<string>) =>
  new Set((title.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w) && !skip.has(w)));

/**
 * One story, told by different outlets: published within 3 days of each other, and sharing a money amount and one
 * other key word ("$1b" and "valuation"), or most of their key words. Daytona's $1B round came as three headlines
 * over three days (21 to 23 Oct), none sharing its first 40 characters.
 */
export function sameStory(a: Article, b: Article, company = ""): boolean {
  if (a.story_id && a.story_id === b.story_id) return true;
  if (storyKey(a) === storyKey(b)) return true;
  const days = Math.abs(Date.parse(a.published_at ?? "") - Date.parse(b.published_at ?? "")) / 86_400_000;
  if (!(days <= STORY_DAYS)) return false;
  const skip = new Set(company.toLowerCase().split(/\s+/));
  const [ma, mb] = [amounts(a.title), amounts(b.title)];
  const [wa, wb] = [keyWords(a.title, skip), keyWords(b.title, skip)];
  const sharedWords = [...wa].filter((w) => wb.has(w)).length;
  if ([...ma].some((m) => mb.has(m)) && sharedWords >= 1) return true;
  return sharedWords / Math.max(1, Math.min(wa.size, wb.size)) >= 0.6 && sharedWords >= 3;
}

/**
 * One article per story, keeping the first (newest first in, newest first out). An article joins a story when it
 * matches any article already in it, merged ones too, so a story told over several days stays one.
 */
export function oneStoryEach(articles: Article[], company = ""): Article[] {
  const kept: Article[] = [];
  const seen: Article[] = [];
  for (const a of articles) {
    if (!seen.some((s) => sameStory(s, a, company))) kept.push(a);
    seen.push(a);
  }
  return kept;
}

/** Articles mainly about the company, newest first, one per story, no repeats. */
export function keepArticles(existing: Article[], incoming: Article[], company = ""): Article[] {
  const ids = new Set(existing.map((a) => a.id));
  const kept = [...existing];
  const seen = [...existing];
  for (const article of incoming) {
    if (article.match?.level !== "primary" || ids.has(article.id)) continue;
    const repeat = seen.some((k) => sameStory(k, article, company));
    seen.push(article);
    if (repeat) continue;
    ids.add(article.id);
    kept.push(article);
  }
  return kept.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

export type NewsSearchResult =
  | { ok: true; articles: Article[]; credits: number }
  | { ok: false; reason: NonNullable<NewsCheck["reason"]>; nextRefillAt: string | null; credits: number };

/** News about one domain since `from` (epoch ms), newest first, up to 3 pages of 10. Never throws for an API error. */
export async function searchNews(api: NewsApi, domain: string, from: number, usage: Usage = {}): Promise<NewsSearchResult> {
  const found: Article[] = [];
  let credits = 0;
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await api.search({
        searchBy: { type: "entity", entity: { type: "domain", domain } },
        filterBy: { date: { from } },
        sortBy: { type: "newest" },
        limit: 10,
        cursor,
        tags: [APP_TAG],
      });
      credits += creditsOf(res);
      recordCall(usage, USAGE_ROW.news, res);
      found.push(...res.data);
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
  } catch (error) {
    const failure = failureOf(error);
    const reason = failure.status === 404 ? "no_news_source" : failure.status === 402 ? "out_of_credits" : "failed";
    return { ok: false, reason, nextRefillAt: failure.nextRefillAt, credits };
  }
  return { ok: true, articles: found, credits };
}

/**
 * Checks one competitor's news, at most once every `everyDays` days (settings file, default 1), whoever calls it: lib/background.ts runs it after each refresh.
 * from: the last good check, or 90 days before it was added.
 */
export async function checkNews(
  store: Store,
  api: NewsApi,
  competitor: CompetitorRecord,
  now: Date,
  usage: Usage = {},
  everyDays = 1,
): Promise<{ checked: boolean; saved: number; credits: number }> {
  const last = await store.get<NewsCheck>(newsCheckKey(competitor.slug));
  if (last && now.getTime() - Date.parse(last.at) < everyDays * DAY_MS - 60_000) return { checked: false, saved: 0, credits: 0 };

  const from = last?.ok ? Date.parse(last.at) : Date.parse(competitor.addedAt) - 90 * DAY_MS;
  // Claim the search first: write its time before searching, so a second trigger moments later (often another
  // server instance, from a webhook a second apart) sees "searched just now" and skips. The result overwrites this.
  // Two triggers within the same few milliseconds can still both search: the store has no atomic claim.
  const claim: NewsCheck = last ? { ...last, at: now.toISOString() } : { at: now.toISOString(), ok: true, reason: null, nextRefillAt: null };
  await store.set<NewsCheck>(newsCheckKey(competitor.slug), claim);
  const result = await searchNews(api, competitor.domain, from, usage);
  if (!result.ok) {
    await store.set<NewsCheck>(newsCheckKey(competitor.slug), {
      at: now.toISOString(),
      ok: false,
      reason: result.reason,
      nextRefillAt: result.nextRefillAt,
    });
    return { checked: true, saved: 0, credits: result.credits };
  }
  const { articles: searched, credits } = result;
  // Articles about another company count as no news: nothing is saved and the check still worked.
  const found = relevantArticles(searched, competitor.name, competitor.domain).articles;

  const existing = (await store.get<Article[]>(newsKey(competitor.slug))) ?? [];
  const kept = keepArticles(existing, found, competitor.name);
  await store.set(newsKey(competitor.slug), kept);
  await store.set<NewsCheck>(newsCheckKey(competitor.slug), { at: now.toISOString(), ok: true, reason: null, nextRefillAt: null });
  return { checked: true, saved: kept.length - existing.length, credits };
}
