/**
 * Keeps the store up to date so pages render from the store alone: saves new changes and each monitor's
 * Working or Not working state. All calls are free (0 credits), but they are still requests, so it reads
 * only when something can have happened:
 * - a monitor's daily run time has passed (context.dev runs each monitor once a day, each at its own time),
 * - the user pressed Check now in the last 20 minutes,
 * - a first check is running: a monitor was just added or given a new address (every 15 seconds, for up to 10 minutes),
 * - the last read failed (try again), or
 * - nothing was read for 6 hours (a backstop for status changes such as a monitor paused in context.dev).
 * Otherwise never more often than every 5 minutes. A read is one list call, plus runs only for monitors whose last run moved,
 * plus a change sync only when a monitor reports a newer change.
 */
import { loadCompetitors } from "./competitors";
import { loadConfig, type Schedule } from "./config";
import type { MonitorsApi } from "./context";
import type { Store } from "./store/types";
import { syncChanges } from "./sync";
import { readMonitors, type WatchState } from "./watch-status";
import { webhookParams } from "./watches";
import { loadSecrets, saveSecrets, webhookUrl } from "./webhook";

export const WATCH_STATES = "watch-states";
export const REFRESH_EVERY_MS = 5 * 60 * 1000;
/** After a run time passes, keep looking for its result this long. A page run takes under a minute. */
const RUN_WINDOW_MS = 60 * 60 * 1000;
const BACKSTOP_MS = 6 * 60 * 60 * 1000;
const CHECK_NOW_WINDOW_MS = 20 * 60 * 1000;
/** A first check takes seconds, so while one runs the page reads every 15 seconds, for up to 10 minutes. */
export const FIRST_CHECK_EVERY_MS = 15 * 1000;
const FIRST_CHECK_WINDOW_MS = 10 * 60 * 1000;

export type SavedStates = {
  /** When the states were last read from context.dev. Empty when they never were. */
  at: string;
  states: Record<string, WatchState>;
  /** Each monitor's next scheduled run, from context.dev. Null while paused. */
  nextRuns?: Record<string, string | null>;
  lastRuns?: Record<string, string | null>;
  lastChanges?: Record<string, string | null>;
  statuses?: Record<string, string>;
  /** The settings the monitors were last brought in line with: webhook address and schedule. */
  settings?: string;
  /** Until this time, read every 5 minutes: the user pressed Check now. */
  watchUntil?: string | null;
  /** Until this time, read every 15 seconds: a first check is running. Cleared once no monitor is setting up. */
  firstChecksUntil?: string | null;
  /** Set when the last attempt failed. The states above are then from `at`. */
  failedAt: string | null;
};

export async function loadSavedStates(store: Store): Promise<SavedStates | null> {
  return store.get<SavedStates>(WATCH_STATES);
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** The settings existing monitors should follow. Changing the settings file or APP_URL makes a read due. */
export type MonitorSettings = { webhookUrl: string | null; schedule: Schedule };

export function currentSettings(): MonitorSettings {
  return { webhookUrl: webhookUrl(), schedule: loadConfig().schedule };
}

const settingsKey = (s: MonitorSettings) => JSON.stringify([s.webhookUrl, s.schedule.every, s.schedule.unit]);

/** Whether a read can find something new now. See the rules at the top of this file. */
export function isDue(saved: SavedStates | null, now: Date, settings: MonitorSettings = currentSettings()): boolean {
  const t = now.getTime();
  const firstChecks = checkingFirstRuns(saved, now);
  if (t - Math.max(time(saved?.at), time(saved?.failedAt)) < (firstChecks ? FIRST_CHECK_EVERY_MS : REFRESH_EVERY_MS)) return false;
  if (firstChecks) return true;
  if (!saved?.at || saved.failedAt) return true;
  if (saved.settings !== settingsKey(settings)) return true;
  if (saved.watchUntil && t < time(saved.watchUntil)) return true;
  if (t - time(saved.at) >= BACKSTOP_MS) return true;
  return Object.values(saved.nextRuns ?? {}).some((run) => run !== null && time(run) <= t && t - time(run) <= RUN_WINDOW_MS);
}

/** The earliest scheduled run still ahead, for "Next check in …". */
export function nextRun(saved: SavedStates | null, now: Date): string | null {
  return (
    Object.values(saved?.nextRuns ?? {})
      .filter((run): run is string => Boolean(run) && time(run) > now.getTime())
      .sort()[0] ?? null
  );
}

/** Banner rule: say the data may be old only when the last good check is over an hour old. One slow moment is not news. */
export const STALE_WARNING_MS = 60 * 60 * 1000;

export function showStaleWarning(saved: SavedStates | null, now: Date): boolean {
  return Boolean(saved?.failedAt) && now.getTime() - time(saved?.at) >= STALE_WARNING_MS;
}

/** True while a first check runs after the user added a monitor or changed its address. Open pages then ask every 10 seconds. */
export function checkingFirstRuns(saved: SavedStates | null, now: Date): boolean {
  return now.getTime() < time(saved?.firstChecksUntil);
}

/**
 * After Check now: read every 5 minutes for the next 20 minutes, so the result shows soon.
 * firstChecks (a new monitor or a new address): also read every 15 seconds until its first check is done.
 */
export async function watchForResults(store: Store, now: Date = new Date(), options: { firstChecks?: boolean } = {}): Promise<void> {
  const saved = await loadSavedStates(store);
  await store.set(WATCH_STATES, {
    ...(saved ?? { at: "", states: {}, failedAt: null }),
    watchUntil: new Date(now.getTime() + CHECK_NOW_WINDOW_MS).toISOString(),
    ...(options.firstChecks ? { firstChecksUntil: new Date(now.getTime() + FIRST_CHECK_WINDOW_MS).toISOString() } : {}),
  } satisfies SavedStates);
}

type RefreshResult =
  | { status: "refreshed"; savedChanges: number; changedStates: boolean; runsRead: number; synced: boolean }
  | { status: "fresh" }
  | { status: "failed" };
let running: Promise<RefreshResult> | null = null;

/** Two tabs asking at once share one run. */
export function refresh(
  store: Store,
  api: MonitorsApi,
  options: { now?: Date; force?: boolean; settings?: MonitorSettings } = {},
): Promise<RefreshResult> {
  running ??= runRefresh(store, api, options).finally(() => {
    running = null;
  });
  return running;
}

async function runRefresh(
  store: Store,
  api: MonitorsApi,
  options: { now?: Date; force?: boolean; settings?: MonitorSettings },
): Promise<RefreshResult> {
  const now = options.now ?? new Date();
  const settings = options.settings ?? currentSettings();
  const saved = await loadSavedStates(store);
  if (!options.force && !isDue(saved, now, settings)) return { status: "fresh" };

  try {
    const competitors = await loadCompetitors(store);
    const snapshot = await readMonitors(api, competitors, saved?.at ? saved : null);
    // People see "checks stopped for now". The developer reads the cause here.
    if ([...snapshot.states.values()].some((w) => w.state === "not_working" && w.fix === "contact_support")) {
      console.warn("context.dev skipped monitor runs: the account is out of credits.");
    }
    await alignMonitors(store, api, snapshot.monitors, settings);
    const synced = snapshot.changesMoved;
    const { saved: savedChanges } = synced ? await syncChanges(store, api) : { saved: 0 };
    const next: SavedStates = {
      at: now.toISOString(),
      states: Object.fromEntries(snapshot.states),
      nextRuns: snapshot.nextRuns,
      lastRuns: snapshot.lastRuns,
      lastChanges: snapshot.lastChanges,
      statuses: snapshot.statuses,
      watchUntil: saved?.watchUntil ?? null,
      // Keep reading fast only while a monitor is still on its first check.
      firstChecksUntil: [...snapshot.states.values()].some((s) => s.state === "setting_up") ? (saved?.firstChecksUntil ?? null) : null,
      settings: settingsKey(settings),
      failedAt: null,
    };
    await store.set(WATCH_STATES, next);
    const changedStates = JSON.stringify(saved?.states ?? {}) !== JSON.stringify(next.states);
    return { status: "refreshed", savedChanges, changedStates, runsRead: snapshot.runsRead, synced };
  } catch (error) {
    console.error("Refresh failed:", error instanceof Error ? error.message : error);
    await store.set(WATCH_STATES, { ...(saved ?? { at: "", states: {} }), failedAt: now.toISOString() } satisfies SavedStates);
    return { status: "failed" };
  }
}

/**
 * Brings existing monitors in line with the settings: adds the webhook once the app has a public address, and
 * applies a changed schedule. Both are free updates that keep each monitor's saved copy of the page
 * (context.dev docs: monitors/targets, "Updating ... schedule ... or webhook keeps the baseline").
 * Saves each monitor's signing secret for the webhook route.
 */
export async function alignMonitors(
  store: Store,
  api: MonitorsApi,
  monitors: { id: string; schedule?: { frequency: number; unit: string }; webhook?: { url: string; secret?: string } | null }[],
  settings: MonitorSettings,
): Promise<number> {
  const secrets = await loadSecrets(store);
  let updated = 0;
  let secretsChanged = false;
  for (const m of monitors) {
    const body: Parameters<MonitorsApi["update"]>[1] = {};
    if (settings.webhookUrl && m.webhook?.url !== settings.webhookUrl) body.webhook = webhookParams(settings.webhookUrl);
    if (m.schedule && (m.schedule.frequency !== settings.schedule.every || m.schedule.unit !== settings.schedule.unit)) {
      body.schedule = { type: "interval", frequency: settings.schedule.every, unit: settings.schedule.unit };
    }
    let secret = m.webhook?.secret;
    if (Object.keys(body).length) {
      const res = await api.update(m.id, body);
      updated++;
      secret = res.webhook?.secret ?? secret;
    }
    if (secret && secrets[m.id] !== secret) {
      secrets[m.id] = secret;
      secretsChanged = true;
    }
  }
  if (secretsChanged) await saveSecrets(store, secrets);
  return updated;
}
