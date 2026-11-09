/**
 * Creates and deletes the monitors behind a competitor's Pricing and Changelog watches.
 * News is not a monitor: see lib/news.ts.
 */
import type { MonitorCreateParams } from "context.dev/resources";
import { APP_TAG, creditsOf, type MonitorsApi } from "./context";
import type { CompetitorRecord, Watch } from "./competitors";
import type { PageKind } from "./find-pages";

export const INSTRUCTIONS: Record<PageKind, string> = {
  changelog: "Report new features and product launches. Ignore bug fixes, patch notes and dependency bumps.",
  pricing:
    "Report any change to plan names, prices, limits or what each plan includes. Ignore wording, layout and testimonial changes.",
};

export function monitorParams(competitor: CompetitorRecord, kind: PageKind, url: string): MonitorCreateParams {
  const instructions = [INSTRUCTIONS[kind], competitor.focus].filter(Boolean).join(" ");
  return {
    name: `${competitor.name} · ${kind}`,
    target: { type: "page", url, instructions },
    change_detection: { type: "semantic" },
    schedule: { type: "interval", frequency: 1, unit: "days" },
    tags: [APP_TAG, `cw:${competitor.slug}`, `kind:${kind}`],
  };
}

/** Creates one monitor per page found. Returns the watches and the credits the API reported. */
export async function startWatches(
  api: MonitorsApi,
  competitor: CompetitorRecord,
  pages: Partial<Record<PageKind, string>>,
  now: string,
): Promise<{ watches: Partial<Record<PageKind, Watch>>; credits: number }> {
  const watches: Partial<Record<PageKind, Watch>> = {};
  let credits = 0;
  for (const kind of ["pricing", "changelog"] as const) {
    const url = pages[kind];
    if (!url) continue;
    const monitor = await api.create(monitorParams(competitor, kind, url));
    credits += creditsOf(monitor);
    watches[kind] = { url, monitorId: monitor.id, addedAt: now };
  }
  return { watches, credits };
}

/** Deletes the monitors. Deleting also deletes context.dev's copy of their changes: sync first. */
export async function stopWatches(api: MonitorsApi, competitor: CompetitorRecord): Promise<void> {
  for (const watch of Object.values(competitor.watches)) {
    if (watch) await api.delete(watch.monitorId);
  }
}
