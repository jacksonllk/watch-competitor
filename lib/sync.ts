/**
 * Saves every new monitor change into the store. context.dev deletes a monitor's changes with the
 * monitor and states no retention period, so the store is the record. Listing changes costs 0 credits.
 */
import { APP_TAG, type MonitorsApi } from "./context";
import { slugOf, type Change } from "./events";
import type { Store } from "./store/types";

export const SYNC_CURSOR = "sync:cursor";
const PAGE_SIZE = 100;
/** Stops a runaway sync. 50 pages of 100 is far more than a free account can produce. */
const MAX_PAGES = 50;

export const changesKey = (slug: string) => `changes:${slug}`;

export async function loadChanges(store: Store, slug: string): Promise<Change[]> {
  return (await store.get<Change[]>(changesKey(slug))) ?? [];
}

/** Lists changes since the cursor, saves the new ones per competitor, then moves the cursor. */
export async function syncChanges(store: Store, api: MonitorsApi): Promise<{ saved: number }> {
  const since = (await store.get<string>(SYNC_CURSOR)) ?? undefined;
  const fetched: Change[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.listAccountChanges({ tag: APP_TAG, since, limit: PAGE_SIZE, cursor });
    fetched.push(...res.data);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }

  const bySlug = new Map<string, Change[]>();
  for (const change of fetched) {
    const slug = slugOf(change.tags);
    if (slug) bySlug.set(slug, [...(bySlug.get(slug) ?? []), change]);
  }

  let saved = 0;
  for (const [slug, changes] of bySlug) {
    const existing = await loadChanges(store, slug);
    const ids = new Set(existing.map((c) => c.id));
    const fresh = changes.filter((c) => !ids.has(c.id) && ids.add(c.id));
    if (!fresh.length) continue;
    const merged = [...existing, ...fresh].sort((a, b) => b.detected_at.localeCompare(a.detected_at));
    await store.set(changesKey(slug), merged);
    saved += fresh.length;
  }

  // Move the cursor only after every competitor's changes are saved. `since` includes equal times,
  // so the newest change comes back next time and is skipped as a duplicate.
  const newest = fetched.map((c) => c.detected_at).sort().at(-1);
  if (newest && (!since || newest > since)) await store.set(SYNC_CURSOR, newest);
  return { saved };
}
