/**
 * Past launches read from a competitor's own changelog page, so the timeline is not empty before its monitors start.
 * A monitor only sees changes from the day it starts. A changelog lists its own dated entries, so one read of the page
 * (Markdown) gives the last 90 days of launches. They show as Feature events marked "From their changelog".
 * The reader knows three layouts, checked on saved real pages on 9 Nov (Modal, Daytona, E2B). A page in another layout
 * gives no entries, never wrong ones.
 */
import type { CompetitorRecord } from "./competitors";
import type { CompetitorEvent } from "./events";
import type { Store } from "./store/types";

export type HistoryEntry = { id: string; date: string; title: string; summary: string; url: string };

export const historyKey = (slug: string) => `history:${slug}`;

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
