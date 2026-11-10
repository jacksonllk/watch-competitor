/**
 * Creates and deletes the monitors behind a competitor's Pricing and Changelog watches.
 * News is not a monitor: see lib/news.ts.
 */
import type { MonitorCreateParams } from "context.dev/resources";
import { APP_TAG, recordCall, USAGE_ROW, type MonitorsApi, type Usage } from "./context";
import type { CompetitorRecord, Watch } from "./competitors";
import { DEFAULT_CONFIG, type Schedule } from "./config";
import type { PageKind } from "./find-pages";

export type MonitorOptions = {
  /** The base sentence per page kind, from the settings file. The user's focus is added after it. */
  instructions?: Record<PageKind, string>;
  /** How often context.dev checks the page, from the settings file. Default once a day. */
  schedule?: Schedule;
  /** Where context.dev sends "run finished" events. Null: no webhook (the app reads on its own schedule). */
  webhookUrl?: string | null;
};

/** The webhook every monitor gets when the app has a public address: one event per finished run, with retries. */
export function webhookParams(url: string) {
  return { url, events: ["run.completed" as const], retry: {} };
}

export function monitorParams(competitor: CompetitorRecord, kind: PageKind, url: string, options: MonitorOptions = {}): MonitorCreateParams {
  const base = options.instructions ?? DEFAULT_CONFIG.instructions;
  const schedule = options.schedule ?? DEFAULT_CONFIG.schedule;
  const instructions = [base[kind], competitor.focus].filter(Boolean).join(" ");
  return {
    name: `${competitor.name} · ${kind}`,
    target: { type: "page", url, instructions },
    change_detection: { type: "semantic" },
    schedule: { type: "interval", frequency: schedule.every, unit: schedule.unit },
    tags: [APP_TAG, `cw:${competitor.slug}`, `kind:${kind}`],
    ...(options.webhookUrl ? { webhook: webhookParams(options.webhookUrl) } : {}),
  };
}

/**
 * Creates one monitor per page found. Creating is free. Each monitor's first check is charged
 * 1 credit on its run, which the dashboard lists under /monitors/run.
 */
export async function startWatches(
  api: MonitorsApi,
  competitor: CompetitorRecord,
  pages: Partial<Record<PageKind, string>>,
  now: string,
  usage: Usage = {},
  options: MonitorOptions = {},
): Promise<{ watches: Partial<Record<PageKind, Watch>>; secrets: Record<string, string> }> {
  const watches: Partial<Record<PageKind, Watch>> = {};
  const secrets: Record<string, string> = {};
  for (const kind of ["pricing", "changelog"] as const) {
    const url = pages[kind];
    if (!url) continue;
    const monitor = await api.create(monitorParams(competitor, kind, url, options));
    recordCall(usage, USAGE_ROW.createMonitor, monitor);
    watches[kind] = { url, monitorId: monitor.id, addedAt: now };
    if (monitor.webhook?.secret) secrets[monitor.id] = monitor.webhook.secret;
  }
  return { watches, secrets };
}

/** Deletes the monitors. Deleting also deletes context.dev's copy of their changes: sync first. */
export async function stopWatches(api: MonitorsApi, competitor: CompetitorRecord): Promise<void> {
  for (const watch of Object.values(competitor.watches)) {
    if (watch) await api.delete(watch.monitorId);
  }
}
