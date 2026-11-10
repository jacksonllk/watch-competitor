/** The competitors a user watches, saved in the store under `competitors`. */
import type { Competitor } from "./events";
import type { PageKind } from "./find-pages";
import type { PageType } from "./page-types";
import type { Store } from "./store/types";

export type Watch = { url: string; monitorId: string; addedAt: string };

/**
 * A page watched on top of the pricing page and changelog, picked in Add more monitors. kind sets its event type:
 * pricing, changelog, or "page" with page saying which kind (careers, customers…). label is its tag, such as "Careers".
 */
export type ExtraWatch = Watch & { kind: MonitorKind; label: string; page?: PageType; removedAt?: string };
export type MonitorKind = PageKind | "page";

/** The name each main watch shows. Extra watches carry their own, such as "Blog". */
export const MAIN_LABEL: Record<PageKind, string> = { changelog: "Changelog", pricing: "Pricing" };

export type CompetitorRecord = Competitor & {
  logo: string | null;
  description: string | null;
  /** Extra words for the monitors' instructions, such as "Only report changes about sandboxes." */
  focus: string | null;
  /** False when the user chose to watch without news, for example when the news is about another company. */
  news?: boolean;
  addedAt: string;
  status: "watching" | "removed";
  removedAt: string | null;
  watches: Partial<Record<PageKind, Watch>>;
  /** Extra pages, each its own monitor. Missing on competitors added before 10 Nov. */
  extra?: ExtraWatch[];
};

/**
 * Every monitor of a competitor: its changelog and pricing page, then the extra pages.
 * A removed extra page stays on the record, so its old changes keep their name, but it is not a monitor any more.
 */
export function allWatches(c: Pick<CompetitorRecord, "watches" | "extra">): ExtraWatch[] {
  const main = (["changelog", "pricing"] as const).flatMap((kind) => {
    const w = c.watches[kind];
    return w ? [{ ...w, kind, label: MAIN_LABEL[kind] }] : [];
  });
  return [...main, ...(c.extra ?? []).filter((w) => !w.removedAt)];
}

const KEY = "competitors";

export async function loadCompetitors(store: Store): Promise<CompetitorRecord[]> {
  return (await store.get<CompetitorRecord[]>(KEY)) ?? [];
}

export async function saveCompetitor(store: Store, record: CompetitorRecord): Promise<void> {
  const all = await loadCompetitors(store);
  const rest = all.filter((c) => c.slug !== record.slug);
  await store.set(KEY, [...rest, record]);
}

/** "Acme Notes" -> "acme-notes". Adds -2, -3 when the slug is taken by another domain. */
export function slugFor(name: string, domain: string, taken: CompetitorRecord[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || domain.replace(/[^a-z0-9]+/g, "-");
  let slug = base;
  for (let n = 2; taken.some((c) => c.slug === slug && c.domain !== domain); n++) slug = `${base}-${n}`;
  return slug;
}
