/**
 * The context.dev client and the narrow parts of it this app uses.
 * Tests pass fakes with the same shape, so CI never calls the live API.
 */
import ContextDev, { APIError } from "context.dev";
import type {
  BrandSearchParams,
  BrandSearchResponse,
  MonitorCreateParams,
  MonitorGetLimitsResponse,
  MonitorListAccountChangesParams,
  MonitorListAccountChangesResponse,
  MonitorListRunsParams,
  MonitorListRunsResponse,
  NewsSearchParams,
  NewsSearchResponse,
} from "context.dev/resources";

/** Every request and every monitor carries this tag, so usage traces to this app. */
export const APP_TAG = "competitor-watch";

type Credits = { key_metadata?: { credits_consumed: number } };

export type MonitorsApi = {
  create(body: MonitorCreateParams): PromiseLike<{ id: string; initial_run_id: string | null } & Credits>;
  delete(monitorId: string): PromiseLike<unknown>;
  listAccountChanges(query: MonitorListAccountChangesParams): PromiseLike<MonitorListAccountChangesResponse>;
  listRuns(monitorId: string, query: MonitorListRunsParams): PromiseLike<MonitorListRunsResponse>;
  getLimits(): PromiseLike<MonitorGetLimitsResponse>;
};
export type NewsApi = { search(body: NewsSearchParams): PromiseLike<NewsSearchResponse> };
export type BrandApi = { search(query: BrandSearchParams): PromiseLike<BrandSearchResponse> };
export type ContextApi = { monitors: MonitorsApi; news: NewsApi; brand: BrandApi };

/** The live client. Reads CONTEXT_DEV_API_KEY. */
export function liveApi(): ContextApi {
  return new ContextDev({ apiKey: process.env.CONTEXT_DEV_API_KEY });
}

/**
 * Calls and credits per API, named as the context.dev dashboard's "By API" usage shows them,
 * so the app's numbers can be checked against the dashboard row by row.
 */
export const USAGE_ROW = {
  brandSearch: "Auto-complete",
  news: "Search News",
  createMonitor: "/monitors",
  limits: "/v1/monitors/limits",
  listRuns: "/monitors/{monitor_id}/runs",
  listChanges: "/monitors/changes",
} as const;
export type Usage = Record<string, { calls: number; credits: number }>;

/** Adds one call and the credits its response reports. */
export function recordCall(usage: Usage, row: string, response: unknown): void {
  const entry = (usage[row] ??= { calls: 0, credits: 0 });
  entry.calls += 1;
  entry.credits += creditsOf(response);
}

export function totalCredits(usage: Usage): number {
  return Object.values(usage).reduce((sum, row) => sum + row.credits, 0);
}

/** Credits a response reports. 0 when the response has no key_metadata. */
export function creditsOf(response: unknown): number {
  return (response as Credits | null)?.key_metadata?.credits_consumed ?? 0;
}

export type ApiFailure = {
  status: number | null;
  code: string | null;
  /** From a 402 USAGE_EXCEEDED response: when credits come back. */
  nextRefillAt: string | null;
};

/** The parts of an API error the app shows. Anything that is not an API error has status null. */
export function failureOf(error: unknown): ApiFailure {
  if (!(error instanceof APIError)) return { status: null, code: null, nextRefillAt: null };
  const body = (error.error ?? {}) as { error_code?: string; error_data?: { next_refill_at?: string } };
  return {
    status: error.status ?? null,
    code: body.error_code ?? null,
    nextRefillAt: body.error_data?.next_refill_at ?? null,
  };
}
