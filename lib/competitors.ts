/** The competitors a user watches, saved in the store under `competitors`. */
import type { Competitor } from "./events";
import type { PageKind } from "./find-pages";
import type { Store } from "./store/types";

export type Watch = { url: string; monitorId: string; addedAt: string };

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
};

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
