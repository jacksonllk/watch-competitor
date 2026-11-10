/**
 * Creates and deletes the monitors behind a competitor's Pricing and Changelog watches.
 * News is not a monitor: see lib/news.ts.
 */
import type { MonitorCreateParams } from "context.dev/resources";
import { APP_TAG, recordCall, USAGE_ROW, type MonitorsApi, type Usage } from "./context";
import { allWatches, type CompetitorRecord, type ExtraWatch, type MonitorKind, type Watch } from "./competitors";
import { PAGE_INSTRUCTIONS, type PageType } from "./page-types";
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

/** An extra page to watch: its event type, its address and the short name it shows, such as "Blog". */
export type ExtraPage = { kind: MonitorKind; url: string; label: string; page?: PageType };

export function monitorParams(
  competitor: CompetitorRecord,
  kind: MonitorKind,
  url: string,
  options: MonitorOptions = {},
  label: string = kind,
  page?: PageType,
): MonitorCreateParams {
  const base = options.instructions ?? DEFAULT_CONFIG.instructions;
  const schedule = options.schedule ?? DEFAULT_CONFIG.schedule;
  // Extra pages get the instruction for their kind of page, such as careers. The user's focus follows.
  const sentence = kind === "page" ? PAGE_INSTRUCTIONS[page ?? "other"] : base[kind];
  const instructions = [sentence, competitor.focus].filter(Boolean).join(" ");
  return {
    name: `${competitor.name} · ${label}`,
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
  extraPages: ExtraPage[] = [],
): Promise<{ watches: Partial<Record<PageKind, Watch>>; extra: ExtraWatch[]; secrets: Record<string, string> }> {
  const watches: Partial<Record<PageKind, Watch>> = {};
  const extra: ExtraWatch[] = [];
  const secrets: Record<string, string> = {};
  const create = async (kind: MonitorKind, url: string, label: string, page?: PageType) => {
    const monitor = await api.create(monitorParams(competitor, kind, url, options, label, page));
    recordCall(usage, USAGE_ROW.createMonitor, monitor);
    if (monitor.webhook?.secret) secrets[monitor.id] = monitor.webhook.secret;
    return { url, monitorId: monitor.id, addedAt: now };
  };
  for (const kind of ["pricing", "changelog"] as const) {
    const url = pages[kind];
    if (url) watches[kind] = await create(kind, url, kind);
  }
  for (const p of extraPages) {
    const watch = await create(p.kind, p.url, p.label, p.page);
    extra.push({ ...watch, kind: p.kind, label: p.label, ...(p.kind === "page" ? { page: p.page ?? "other" } : {}) });
  }
  return { watches, extra, secrets };
}

/** Deletes the monitors. Deleting also deletes context.dev's copy of their changes: sync first. */
export async function stopWatches(api: MonitorsApi, competitor: CompetitorRecord): Promise<void> {
  for (const watch of allWatches(competitor)) await api.delete(watch.monitorId);
}
