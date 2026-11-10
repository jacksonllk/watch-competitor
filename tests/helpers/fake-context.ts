import { APIError } from "context.dev";
import type {
  MonitorCreateParams,
  MonitorListAccountChangesParams,
  MonitorListResponse,
  MonitorListRunsResponse,
  NewsSearchParams,
} from "context.dev/resources";
import type { ContextApi } from "@/lib/context";
import type { Change } from "@/lib/events";
import { fixtureBrandSearch } from "@/lib/fixtures/preview";
import type { Article } from "@/lib/news";

/** Offline stand-in for the context.dev client. Records every call. */
export function fakeContext(
  options: {
    changes?: Change[];
    pageSize?: number;
    articles?: Article[];
    newsError?: APIError;
    monitorsUsed?: number;
    brandError?: APIError;
    runs?: Record<string, MonitorListRunsResponse.Data[]>;
    monitors?: MonitorListResponse.Data[];
  } = {},
) {
  const created: MonitorCreateParams[] = [];
  const deleted: string[] = [];
  const listed: MonitorListAccountChangesParams[] = [];
  const searched: NewsSearchParams[] = [];
  const brandSearched: string[] = [];
  const ran: string[] = [];
  const updated: { id: string; body: Record<string, unknown> }[] = [];
  const pageSize = options.pageSize ?? 100;

  const api: ContextApi = {
    monitors: {
      async create(body) {
        created.push(body);
        const hook = (body as { webhook?: { url: string } }).webhook;
        return { id: `mon_${created.length}`, initial_run_id: `run_${created.length}`, ...(hook ? { webhook: { url: hook.url, secret: `whsec_mon_${created.length}` } } : {}) } as never;
      },
      async delete(id) {
        deleted.push(id);
        return { id, deleted: true };
      },
      async listAccountChanges(query) {
        listed.push(query);
        const all = (options.changes ?? [])
          .filter((c) => !query.tag || c.tags.includes(query.tag))
          .filter((c) => !query.since || c.detected_at >= query.since)
          .sort((a, b) => b.detected_at.localeCompare(a.detected_at));
        const start = query.cursor ? Number(query.cursor) : 0;
        const data = all.slice(start, start + pageSize);
        const more = start + pageSize < all.length;
        return { data, has_more: more, next_cursor: more ? String(start + pageSize) : null, request_id: "req_fake" };
      },
      async listRuns(id, query) {
        const data = (options.runs?.[id] ?? []).slice(0, query.limit ?? 25);
        return { data, has_more: false, next_cursor: null, request_id: "req_fake" };
      },
      async update(id, body) {
        updated.push({ id, body: body as Record<string, unknown> });
        const hook = (body as { webhook?: { url: string } }).webhook;
        return { id, webhook: hook ? { url: hook.url, secret: `whsec_${id}` } : null } as never;
      },
      async run(id) {
        ran.push(id);
        return { id: `run_now_${ran.length}`, monitor_id: id, status: "queued" } as never;
      },
      async list() {
        return { data: options.monitors ?? [], has_more: false, next_cursor: null, request_id: "req_fake" };
      },
      async getLimits() {
        return { monitors_limit: 10, monitors_used: options.monitorsUsed ?? 0, plan: "free", request_id: "req_fake" };
      },
    },
    brand: {
      async search(query) {
        brandSearched.push(query.query);
        if (options.brandError) throw options.brandError;
        return { ...fixtureBrandSearch, key_metadata: { credits_consumed: 1, credits_remaining: 900 } };
      },
    },
    news: {
      async search(body) {
        searched.push(body);
        if (options.newsError) throw options.newsError;
        const data = options.articles ?? [];
        return {
          data,
          has_more: false,
          next_cursor: null,
          meta: { count: data.length },
          request_id: "req_fake",
          key_metadata: { credits_consumed: Math.max(1, Math.ceil(data.length / 10)), credits_remaining: 900 },
        };
      },
    },
  };
  return { api, created, deleted, listed, searched, brandSearched, ran, updated };
}

export function apiError(status: number, error_code: string, error_data: Record<string, unknown> = {}) {
  return new APIError(status, { error_code, error_data }, error_code, new Headers());
}
