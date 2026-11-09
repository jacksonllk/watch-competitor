import { APIError } from "context.dev";
import type { MonitorCreateParams, MonitorListAccountChangesParams, NewsSearchParams } from "context.dev/resources";
import type { ContextApi } from "@/lib/context";
import type { Change } from "@/lib/events";
import type { Article } from "@/lib/news";

/** Offline stand-in for the context.dev client. Records every call. */
export function fakeContext(options: { changes?: Change[]; pageSize?: number; articles?: Article[]; newsError?: APIError } = {}) {
  const created: MonitorCreateParams[] = [];
  const deleted: string[] = [];
  const listed: MonitorListAccountChangesParams[] = [];
  const searched: NewsSearchParams[] = [];
  const pageSize = options.pageSize ?? 100;

  const api: ContextApi = {
    monitors: {
      async create(body) {
        created.push(body);
        return { id: `mon_${created.length}`, initial_run_id: `run_${created.length}` };
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
      async listRuns() {
        return { data: [], has_more: false, next_cursor: null, request_id: "req_fake" };
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
  return { api, created, deleted, listed, searched };
}

export function apiError(status: number, error_code: string, error_data: Record<string, unknown> = {}) {
  return new APIError(status, { error_code, error_data }, error_code, new Headers());
}
