/**
 * Working, Not working or Setting up, for each of a competitor's watches. A broken watch must never look
 * like a quiet one. Monitors: their runs and status (0 credits to read). News: our last daily check.
 */
import type { MonitorListResponse, MonitorListRunsResponse } from "context.dev/resources";
import { APP_TAG, type MonitorsApi } from "./context";
import type { CompetitorRecord } from "./competitors";
import type { NewsCheck } from "./news";

export type Run = MonitorListRunsResponse.Data;
export type MonitorInfo = Pick<MonitorListResponse.Data, "id" | "status">;
export type WatchKind = "pricing" | "changelog" | "news";

export type Fix = "edit_address" | "try_another_page" | "wait_for_refill" | "resume" | "none";

export type WatchState =
  /** compared: false while only the baseline has run, so no change could have been found yet. */
  | { kind: WatchKind; state: "working"; lastChecked: string | null; compared: boolean }
  | { kind: WatchKind; state: "setting_up" }
  | { kind: WatchKind; state: "not_working"; reason: string; since: string | null; fix: Fix }
  | { kind: WatchKind; state: "unknown"; reason: string };

const RUNS_TO_READ = 5;

/** Plain words for a run's error code, and the fix to offer. */
function failureText(code: string): { reason: string; fix: Fix } {
  switch (code) {
    case "fetch_failed":
      return { reason: "the page was not found or has no readable text", fix: "edit_address" };
    case "access_policy_denied":
      return { reason: "an access policy in your context.dev account blocks the page", fix: "none" };
    case "judge_failed":
      return { reason: "context.dev could not judge the last changes", fix: "none" };
    default:
      return { reason: "the last checks failed in context.dev", fix: "none" };
  }
}

/** Reads a monitor's state from its newest runs (newest first) and its status. */
export function monitorState(kind: WatchKind, runs: Run[], status: MonitorInfo["status"] | null): WatchState {
  const relevant = runs.filter((r) => r.skip_reason !== "superseded");
  const newest = relevant[0];
  const lastGood = relevant.find((r) => r.status === "completed");

  if (newest?.status === "skipped" && newest.skip_reason === "insufficient_credits") {
    return { kind, state: "not_working", reason: "your context.dev account is out of credits", since: newest.started_at ?? null, fix: "wait_for_refill" };
  }

  // Failed runs in a row, newest first.
  const streak: Run[] = [];
  for (const run of relevant) {
    if (run.status !== "failed") break;
    streak.push(run);
  }
  const code = streak[0]?.error?.code ?? "run_failed";
  // A temporary AI failure shows only after 2 in a row (spec, Watch status).
  const failing = streak.length > 0 && (code !== "judge_failed" || streak.length >= 2);

  if (status === "paused" || status === "failed") {
    const why = failing ? failureText(code).reason : "the monitor is paused";
    return {
      kind,
      state: "not_working",
      reason: status === "failed" || failing ? `paused after repeated failures: ${why}` : why,
      since: streak.at(-1)?.started_at ?? null,
      fix: "resume",
    };
  }
  if (failing) {
    const { reason, fix } = failureText(code);
    return { kind, state: "not_working", reason, since: streak.at(-1)?.started_at ?? null, fix };
  }
  if (!lastGood) return { kind, state: "setting_up" };
  const compared = relevant.some((r) => r.status === "completed" && r.run_type === "scheduled");
  return { kind, state: "working", lastChecked: lastGood.completed_at ?? lastGood.started_at ?? null, compared };
}

/** The News watch's state from our last daily check. */
export function newsState(check: NewsCheck | null): WatchState {
  if (!check) return { kind: "news", state: "setting_up" };
  if (check.ok) return { kind: "news", state: "working", lastChecked: check.at, compared: true };
  if (check.reason === "no_news_source") {
    return { kind: "news", state: "not_working", reason: "no news source covers this company", since: check.at, fix: "none" };
  }
  if (check.reason === "out_of_credits") {
    return { kind: "news", state: "not_working", reason: "your context.dev account is out of credits", since: check.at, fix: "wait_for_refill" };
  }
  return { kind: "news", state: "not_working", reason: "the last news check failed", since: check.at, fix: "none" };
}

export type MonitorSnapshot = {
  states: Map<string, WatchState>;
  nextRuns: Record<string, string | null>;
  /** Each monitor's last run time and last change time, to tell next time what moved. */
  lastRuns: Record<string, string | null>;
  lastChanges: Record<string, string | null>;
  statuses: Record<string, string>;
  /** How many monitors' runs were read this time. */
  runsRead: number;
  /** True when a monitor reports a change newer than last time, so changes need syncing. */
  changesMoved: boolean;
  /** The watched monitors as context.dev lists them, for keeping their settings in line. */
  monitors: MonitorListResponse.Data[];
};

type Previous = { states: Record<string, WatchState>; lastRuns?: Record<string, string | null>; lastChanges?: Record<string, string | null>; statuses?: Record<string, string> };


/**
 * Reads every watched monitor's status with one list call (free). Reads a monitor's runs (free) only when its last run,
 * or its status, moved since last time, or when it is new. When context.dev cannot be reached, it throws.
 */
export async function readMonitors(api: MonitorsApi, competitors: CompetitorRecord[], previous: Previous | null): Promise<MonitorSnapshot> {
  const watched = competitors
    .filter((c) => c.status === "watching")
    .flatMap((c) =>
      (["pricing", "changelog"] as const).flatMap((kind) => {
        const watch = c.watches[kind];
        return watch ? [{ kind, monitorId: watch.monitorId }] : [];
      }),
    );
  const snapshot: MonitorSnapshot = {
    states: new Map(),
    nextRuns: {},
    lastRuns: {},
    lastChanges: {},
    statuses: {},
    runsRead: 0,
    changesMoved: !previous,
    monitors: [],
  };
  if (!watched.length) return snapshot;

  const list = await api.list({ tag: APP_TAG, limit: 100 });
  const byId = new Map(list.data.map((m) => [m.id, m]));
  const toRead = watched.filter((w) => {
    const m = byId.get(w.monitorId);
    if (!m) return false;
    return (
      !previous?.states[w.monitorId] ||
      previous.lastRuns?.[w.monitorId] !== (m.last_run_at ?? null) ||
      previous.statuses?.[w.monitorId] !== m.status
    );
  });
  const runs = await Promise.all(toRead.map((w) => api.listRuns(w.monitorId, { limit: RUNS_TO_READ })));
  snapshot.runsRead = toRead.length;

  for (const w of watched) {
    const m = byId.get(w.monitorId);
    if (!m) {
      snapshot.states.set(w.monitorId, { kind: w.kind, state: "not_working", reason: "the monitor no longer exists in context.dev", since: null, fix: "none" });
      continue;
    }
    snapshot.monitors.push(m);
    snapshot.nextRuns[m.id] = m.next_run_at ?? null;
    snapshot.lastRuns[m.id] = m.last_run_at ?? null;
    snapshot.lastChanges[m.id] = m.last_change_at ?? null;
    snapshot.statuses[m.id] = m.status;
    if (previous && previous.lastChanges?.[m.id] !== (m.last_change_at ?? null)) snapshot.changesMoved = true;
    const read = toRead.indexOf(w);
    snapshot.states.set(m.id, read >= 0 ? monitorState(w.kind, runs[read].data, m.status) : previous!.states[m.id]);
  }
  return snapshot;
}
