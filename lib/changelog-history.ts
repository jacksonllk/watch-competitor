/**
 * Past launches read from a competitor's own changelog page, so the timeline is not empty before its monitors start.
 * A monitor only sees changes from the day it starts. A changelog lists its own dated entries, so reading the page once
 * when the competitor is added (Markdown) gives its recent launches: 90 days by default (`history.changelogDays` in the
 * settings file). A changelog split into pages is read page by page, up to 3. They show as Feature events marked
 * "From their changelog".
 * The reader knows three layouts, checked on saved real pages on 9 Nov (Modal, Daytona, E2B). A page in another layout
 * gives no entries, never wrong ones.
 */
import type { WebScrapeResponse } from "context.dev/resources";
import type { CompetitorRecord } from "./competitors";
import { APP_TAG, failureOf, recordCall, USAGE_ROW, type Usage, type WebApi } from "./context";
import type { CompetitorEvent } from "./events";
import type { Store } from "./store/types";

export type HistoryEntry = { id: string; date: string; title: string; summary: string; url: string };

export const historyKey = (slug: string) => `history:${slug}`;

/** What reading the changelog at Add did, for the "Getting set up" box. */
export type HistoryCheck = {
  at: string;
  days: number;
  ok: boolean;
  /** Entries saved, after the date window, the focus and the housekeeping rule. */
  count: number;
  /** Pages read, each 1 scrape. */
  pages: number;
  /** out_of_credits: the cause is the developer's account ("Contact support."). */
  reason: "failed" | "out_of_credits" | null;
};
export const historyCheckKey = (slug: string) => `historycheck:${slug}`;

/** At most this many changelog pages are read per competitor, so a long changelog cannot run up the bill. */
export const MAX_CHANGELOG_PAGES = 3;

const MAINTENANCE = /\b(dependenc\w*|bumps?|bug ?fix\w*|fix(es|ed)?|patch(es)?|hotfix\w*|release branch sync)\b/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());
const iso = (y: number, m: number, d: number) => (m < 0 || d < 1 || d > 31 ? null : new Date(Date.UTC(y, m, d, 12)).toISOString());
const clean = (text: string) =>
  text
    .replace(/\\\\/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
const absolute = (url: string, page: string) => {
  try {
    return new URL(url, page).href;
  } catch {
    return page;
  }
};

/** "1. [October 27, 2026 … \\ \\ **Title**\\ \\ Text](url)" (Modal). */
function listLayout(md: string, page: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const m of md.matchAll(/^\s*\d+\.\s*\[([A-Z][a-z]+)\s(\d{1,2}),\s(\d{4})[^\n]*?\*\*(.+?)\*\*(.*?)\]\(([^)\s]+)\)/gm)) {
    const date = iso(Number(m[3]), month(m[1]), Number(m[2]));
    if (date) out.push({ id: "", date, title: clean(m[4]), summary: clean(m[5]), url: absolute(m[6], page) });
  }
  return out;
}

/** "NOV 07 2026 …", then "[**Title**](url)", then a description paragraph (Daytona). */
function blockLayout(md: string, page: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const d = lines[i].match(/^([A-Z]{3})\s(\d{2})\s(\d{4})\b/);
    if (!d) continue;
    const date = iso(Number(d[3]), month(d[1]), Number(d[2]));
    let title = "";
    let url = page;
    let summary = "";
    for (let j = i + 1; j < Math.min(lines.length, i + 30) && !/^[A-Z]{3}\s\d{2}\s\d{4}\b/.test(lines[j]); j++) {
      const line = lines[j].trim();
      const link = line.match(/^\[\*\*(.+?)\*\*\]\(([^)\s]+)\)/);
      if (link && !title) {
        title = clean(link[1]);
        url = absolute(link[2], page);
      } else if (title && !summary && line && !/^[[\-!#]|^V?\d+\.\d+/.test(line)) {
        summary = clean(line);
      }
    }
    if (date && title) out.push({ id: "", date, title, summary, url });
  }
  return out;
}

/** "### Nov" then "2026", then "- [Nov 2TitleThis week …](url)" (E2B). */
function monthHeadingLayout(md: string, page: string): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  let year: number | null = null;
  for (const line of md.split("\n")) {
    const y = line.trim().match(/^(20\d{2})$/);
    if (y) year = Number(y[1]);
    // Some pages put a non-breaking space between month and day (E2B, 9 Nov): \s matches both.
    const m = line.match(/^- \[([A-Z][a-z]{2})\s(\d{1,2})(.+?)\]\(([^)\s]+)\)\s*$/);
    if (!m || year === null) continue;
    const date = iso(year, month(m[1]), Number(m[2]));
    const text = clean(m[3]);
    // Title and text are glued together with no space ("…CreationThis week"): split at that join.
    // The earliest join wins: "…HTTPThis week" (after a capital) or "…IntegrationWorkspaces" (lowercase, then a capital).
    const joins = [text.search(/This (week|release|update)\b/), text.search(/(?<=[a-z0-9)])(?=[A-Z][a-z])/)].filter((i) => i > 0);
    const split = joins.length ? Math.min(...joins) : -1;
    const title = split > 0 ? text.slice(0, split).trim() : text;
    const summary = split > 0 ? text.slice(split).trim() : "";
    if (date && title) out.push({ id: "", date, title, summary, url: absolute(m[4], page) });
  }
  return out;
}

/** Words to keep, from a focus like "Only report changes about sandboxes." -> ["sandbox"]. */
export function focusWords(focus: string | null): string[] {
  const match = focus?.match(/about (.+?)\.?$/i);
  if (!match) return [];
  return match[1]
    .split(/,| and | or /i)
    .map((w) => w.trim().toLowerCase().replace(/(x|ch|sh|s)es$/, "$1").replace(/([^s])s$/, "$1"))
    .filter((w) => w.length > 2);
}

/**
 * The dated entries of a changelog page, newest first, within [from, to). One entry per title and date.
 * With focus words, only entries that mention one of them.
 */
export function readChangelog(md: string, page: string, options: { from: string; to: string; focus?: string[] }): HistoryEntry[] {
  const all = [...listLayout(md, page), ...blockLayout(md, page), ...monthHeadingLayout(md, page)];
  const seen = new Set<string>();
  return all
    .filter((e) => e.date >= options.from && e.date < options.to)
    .filter((e) => !options.focus?.length || options.focus.some((w) => `${e.title} ${e.summary}`.toLowerCase().includes(w)))
    // Same rule as the changelog monitor's instruction: no bug fixes, patch notes or dependency bumps.
    .filter((e) => !MAINTENANCE.test(e.title))
    .filter((e) => {
      const key = `${e.date.slice(0, 10)} ${e.title.toLowerCase()}`;
      return !seen.has(key) && Boolean(seen.add(key));
    })
    .map((e) => ({ ...e, id: `hist_${e.date.slice(0, 10)}_${e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}` }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** "page=2" -> 2, ".../page/3" -> 3, anything else -> 1. */
function pageNumber(url: URL): number {
  const fromQuery = Number(url.searchParams.get("page"));
  const fromPath = Number(url.pathname.match(/\/page\/(\d+)\/?$/)?.[1]);
  return fromQuery > 0 ? fromQuery : fromPath > 0 ? fromPath : 1;
}

/**
 * The next page of a changelog split into pages, from the page's HTML: a link marked rel="next", or a link on the same
 * site to the same address with the next page number ("?page=2" or "/page/2"). null when there is none.
 */
export function nextPageUrl(html: string, pageUrl: string): string | null {
  const here = new URL(pageUrl);
  const n = pageNumber(here);
  const base = here.pathname.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "");
  const links = [...html.matchAll(/<(?:a|link)\b[^>]*>/gi)].map((m) => ({
    href: m[0].match(/\shref\s*=\s*["']([^"']+)["']/i)?.[1],
    rel: m[0].match(/\srel\s*=\s*["']([^"']+)["']/i)?.[1] ?? "",
  }));
  const resolve = (href: string | undefined) => {
    try {
      const url = href ? new URL(href.replace(/&amp;/g, "&"), here) : null;
      return url && url.origin === here.origin ? url : null;
    } catch {
      return null;
    }
  };
  for (const link of links) {
    const url = resolve(link.href);
    if (url && /\bnext\b/i.test(link.rel) && url.href !== here.href) return url.href;
  }
  for (const link of links) {
    const url = resolve(link.href);
    if (!url || pageNumber(url) !== n + 1) continue;
    if (url.pathname.replace(/\/page\/\d+\/?$/, "").replace(/\/$/, "") === base) return url.href;
  }
  return null;
}

/**
 * Reads a changelog's dated entries in [from, to), newest first, page by page while the oldest entry on a page is
 * still inside the window, up to MAX_CHANGELOG_PAGES. 1 scrape per page. Never throws: a failed first page is a
 * failed read, a failed later page keeps what the earlier pages gave.
 */
export async function readChangelogHistory(
  api: WebApi,
  url: string,
  options: { from: string; to: string; focus?: string[] },
  usage: Usage = {},
): Promise<{ ok: true; entries: HistoryEntry[]; pages: number } | { ok: false; reason: "failed" | "out_of_credits"; pages: number }> {
  const entries = new Map<string, HistoryEntry>();
  const seen = new Set<string>();
  let page: string | null = url;
  let pages = 0;
  while (page && pages < MAX_CHANGELOG_PAGES) {
    let res: WebScrapeResponse;
    try {
      res = await api.scrape({ url: page, formats: { markdown: true, html: true }, markdownParams: { includeLinks: true }, tags: [APP_TAG] });
    } catch (error) {
      const failure = failureOf(error);
      console.warn(`Changelog history: reading ${page} failed`, failure);
      if (pages === 0) return { ok: false, reason: failure.status === 402 ? "out_of_credits" : "failed", pages };
      break;
    }
    pages += 1;
    recordCall(usage, USAGE_ROW.scrape, res);
    const md = res.markdown?.data;
    if (!md) {
      console.warn(`Changelog history: no Markdown for ${page}`, res.markdown?.error_code ?? "");
      if (pages === 1) return { ok: false, reason: "failed", pages };
      break;
    }
    for (const e of readChangelog(md, page, options)) if (!entries.has(e.id)) entries.set(e.id, e);
    // Every dated entry on the page, in or out of the window and the focus.
    const onPage = readChangelog(md, page, { from: "", to: "~" });
    const repeat = onPage.length > 0 && onPage.every((e) => seen.has(e.id));
    for (const e of onPage) seen.add(e.id);
    const oldest = onPage.at(-1)?.date;
    const next: string | null = res.html?.data ? nextPageUrl(res.html.data, page) : null;
    // Stop when the page has no dated entries, reaches the window's start, has no next page, or repeats an earlier
    // page (a site that ignores the page number serves page 1 again).
    if (!oldest || oldest < options.from || !next || repeat) break;
    page = next;
  }
  return { ok: true, entries: [...entries.values()].sort((a, b) => b.date.localeCompare(a.date)), pages };
}

export async function loadHistory(store: Store, slug: string): Promise<HistoryEntry[]> {
  return (await store.get<HistoryEntry[]>(historyKey(slug))) ?? [];
}

/** A changelog entry as a timeline event: a Feature, marked as read from their changelog rather than detected. */
export function historyToEvent(entry: HistoryEntry, competitor: CompetitorRecord): CompetitorEvent {
  return {
    id: entry.id,
    kind: "changelog",
    competitor: { slug: competitor.slug, name: competitor.name, domain: competitor.domain },
    title: entry.title,
    summary: entry.summary || entry.title,
    detectedAt: entry.date,
    url: entry.url,
    importance: null,
    before: null,
    after: null,
    diff: null,
    excerpt: entry.summary || null,
    origin: "changelog",
  };
}
