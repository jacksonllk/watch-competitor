/**
 * The one place that maps context.dev monitor changes to app events.
 * If the API's change shape differs from the docs, the fix goes here.
 */
import type { MonitorListAccountChangesResponse } from "context.dev/resources";

export type Change = MonitorListAccountChangesResponse.Data;
export type EventKind = "pricing" | "changelog" | "news";
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
};

const KINDS: EventKind[] = ["pricing", "changelog", "news"];

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
export function toEvent(change: Change, competitors: Competitor[]): CompetitorEvent | null {
  const kind = kindOf(change.tags);
  const slug = slugOf(change.tags);
  const competitor = competitors.find((c) => c.slug === slug);
  if (!kind || !competitor) return null;

  const evidence = (change.evidence ?? []).map((e) => e.after).filter(Boolean).join("\n\n");
  return {
    id: change.id,
    kind,
    competitor,
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
