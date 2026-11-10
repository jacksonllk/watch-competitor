/**
 * The one place that maps context.dev monitor changes and News articles to app events.
 * If the API's change shape differs from the docs, the fix goes here.
 */
import type { MonitorListAccountChangesResponse, NewsSearchResponse } from "context.dev/resources";
import type { PageType } from "./page-types";

export type Change = MonitorListAccountChangesResponse.Data;
/** "page": a change on an extra page, such as their careers page. Its label and page say which. */
export type EventKind = "pricing" | "changelog" | "news" | "page";
export type Importance = "low" | "medium" | "high";

export type Competitor = { slug: string; name: string; domain: string };

export type CompetitorEvent = {
  id: string;
  kind: EventKind;
  competitor: Competitor;
  title: string;
  summary: string;
  /** ISO 8601 time the monitor found the change. */
  detectedAt: string;
  url: string;
  importance: Importance | null;
  /** Short old and new values, when the monitor gives them. */
  before: string | null;
  after: string | null;
  /** The raw diff for a page change: lines starting with + or -. Untrusted. Never shown as is. */
  diff: string | null;
  /** Competitor text: the diff for a page, or the article text for news. Untrusted. */
  excerpt: string | null;
  /** "changelog": read from their changelog page as a past launch, not detected by a monitor. */
  origin?: "changelog";
  /** Extra pages only: the page's name for its tag ("Careers", "Enterprise") and, for "page" events, what kind of page. */
  label?: string;
  page?: PageType;
};

/** A competitor with its extra pages, so a change can be matched to the page that found it. */
export type CompetitorWithPages = Competitor & { extra?: { monitorId: string; label: string; page?: PageType }[] };

const KINDS: EventKind[] = ["pricing", "changelog", "news", "page"];

/** Reads the event kind from the monitor tag `kind:<kind>`. target_type cannot tell Pricing from Changelog. */
export function kindOf(tags: string[]): EventKind | null {
  for (const tag of tags) {
    const kind = tag.startsWith("kind:") ? tag.slice(5) : null;
    if (kind && (KINDS as string[]).includes(kind)) return kind as EventKind;
  }
  return null;
}

/** Reads the competitor slug from the monitor tag `cw:<slug>`. */
export function slugOf(tags: string[]): string | null {
  const tag = tags.find((t) => t.startsWith("cw:") && t.length > 3);
  return tag ? tag.slice(3) : null;
}

/** Returns null for a change without our tags, or for a competitor that is no longer watched. */
export function toEvent(change: Change, competitors: CompetitorWithPages[]): CompetitorEvent | null {
  const kind = kindOf(change.tags);
  const slug = slugOf(change.tags);
  const competitor = competitors.find((c) => c.slug === slug);
  if (!kind || !competitor) return null;

  const evidence = (change.evidence ?? []).map((e) => e.after).filter(Boolean).join("\n\n");
  const extra = competitor.extra?.find((w) => w.monitorId === change.monitor_id);
  return {
    id: change.id,
    kind,
    competitor: { slug: competitor.slug, name: competitor.name, domain: competitor.domain },
    ...(extra ? { label: extra.label, ...(extra.page ? { page: extra.page } : {}) } : {}),
    title: change.title,
    summary: change.summary,
    detectedAt: change.detected_at,
    url: change.url,
    importance: change.importance ?? null,
    before: change.before_text_excerpt || null,
    after: change.after_text_excerpt || null,
    diff: change.diff || null,
    excerpt: change.diff || change.after_text_excerpt || evidence || null,
  };
}

/** A News API article as a timeline event. News has no importance rating and no diff. */
export function articleToEvent(article: NewsSearchResponse.Data, competitor: Competitor): CompetitorEvent {
  return {
    id: article.id,
    kind: "news",
    competitor,
    title: article.title,
    summary: article.description ?? article.title,
    detectedAt: article.published_at ?? "",
    url: article.url,
    importance: null,
    before: null,
    after: null,
    diff: null,
    excerpt: article.description,
  };
}

/** The word each type's tag shows. An extra page's tag shows its own name instead, such as "Careers". */
export const KIND_TAG = { changelog: "Feature", pricing: "Pricing", news: "News", page: "Page" } as const;

/**
 * The filter a change belongs to on the competitor page: its tag. "changelog", "pricing" and "news" for the main types,
 * else its page's name ("careers", "integrations"). A custom page tagged "Pricing" joins the Pricing filter.
 */
export function filterKey(e: { kind: EventKind; label?: string }): string {
  if (!e.label) return e.kind;
  const key = e.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const main = (Object.keys(KIND_TAG) as EventKind[]).find((k) => KIND_TAG[k].toLowerCase() === key);
  return main && main !== "page" ? main : key || e.kind;
}
