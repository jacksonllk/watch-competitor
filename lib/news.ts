/**
 * The News watch: one News search by domain per competitor per day. Not a monitor.
 * 1 credit per 10 articles. Keeps articles mainly about the company (match.level primary),
 * one per story.
 */
import type { NewsSearchResponse } from "context.dev/resources";
import { APP_TAG, creditsOf, failureOf, type NewsApi } from "./context";
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

/** Articles mainly about the company, newest first, one per story, no repeats. */
export function keepArticles(existing: Article[], incoming: Article[]): Article[] {
  const ids = new Set(existing.map((a) => a.id));
  const stories = new Set(existing.map((a) => a.story_id));
  const kept = [...existing];
  for (const article of incoming) {
    if (article.match?.level !== "primary" || ids.has(article.id) || stories.has(article.story_id)) continue;
    ids.add(article.id);
    stories.add(article.story_id);
    kept.push(article);
  }
  return kept.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}

/**
 * Checks one competitor's news, at most once a day. Visitors opening the app never trigger it:
 * only the scheduled job calls this. from: the last good check, or 90 days before it was added.
 */
export async function checkNews(
  store: Store,
  api: NewsApi,
  competitor: CompetitorRecord,
  now: Date,
): Promise<{ checked: boolean; saved: number; credits: number }> {
  const last = await store.get<NewsCheck>(newsCheckKey(competitor.slug));
  if (last && now.getTime() - Date.parse(last.at) < DAY_MS - 60_000) return { checked: false, saved: 0, credits: 0 };

  const from = last?.ok ? Date.parse(last.at) : Date.parse(competitor.addedAt) - 90 * DAY_MS;
  const found: Article[] = [];
  let credits = 0;
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await api.search({
        searchBy: { type: "entity", entity: { type: "domain", domain: competitor.domain } },
        filterBy: { date: { from } },
        sortBy: { type: "newest" },
        limit: 10,
        cursor,
        tags: [APP_TAG],
      });
      credits += creditsOf(res);
      found.push(...res.data);
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
  } catch (error) {
    const failure = failureOf(error);
    const reason = failure.status === 404 ? "no_news_source" : failure.status === 402 ? "out_of_credits" : "failed";
    await store.set<NewsCheck>(newsCheckKey(competitor.slug), {
      at: now.toISOString(),
      ok: false,
      reason,
      nextRefillAt: failure.nextRefillAt,
    });
    return { checked: true, saved: 0, credits };
  }

  const existing = (await store.get<Article[]>(newsKey(competitor.slug))) ?? [];
  const kept = keepArticles(existing, found);
  await store.set(newsKey(competitor.slug), kept);
  await store.set<NewsCheck>(newsCheckKey(competitor.slug), { at: now.toISOString(), ok: true, reason: null, nextRefillAt: null });
  return { checked: true, saved: kept.length - existing.length, credits };
}
