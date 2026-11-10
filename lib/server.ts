/** What every route and page needs: the store, the context.dev client and the settings file. Server only. */
import { liveApi, type ContextApi } from "./context";
import { checkAddress, morePage, webHop, type FetchHop } from "./find-pages";
import { PAGE_INSTRUCTIONS, type PageType } from "./page-types";
import { getStore, type StoreChoice } from "./store";

export function contextApi(): ContextApi | null {
  return process.env.CONTEXT_DEV_API_KEY ? liveApi() : null;
}

export type Setup = { ok: true; store: NonNullable<StoreChoice["store"]>; api: ContextApi } | { ok: false; problem: "no_store" | "no_key" };

/** The store and the API client, or what is missing. */
export function setup(): Setup {
  const choice = getStore();
  if (!choice.store) return { ok: false, problem: "no_store" };
  const api = contextApi();
  if (!api) return { ok: false, problem: "no_key" };
  return { ok: true, store: choice.store, api };
}

export function setupError(problem: "no_store" | "no_key"): Response {
  const message =
    problem === "no_key"
      ? "Add your context.dev API key to .env as CONTEXT_DEV_API_KEY, then restart the app."
      : "Connect a store: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then restart.";
  return Response.json({ status: "setup_needed", problem, message }, { status: 503 });
}

/** The JSON body, or null when it is missing or not an object. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const text = (value: unknown, max = 500): string => (typeof value === "string" ? value.slice(0, max) : "");

/** The most extra pages one request can add. */
export const MAX_MORE = 8;

export type MoreRead =
  | { ok: true; pages: { kind: "pricing" | "changelog" | "page"; url: string; label: string; page?: PageType }[] }
  | { ok: false; label: string | null };

/**
 * Extra pages sent by the browser (Add more monitors): up to MAX_MORE, each address checked again (free).
 * A page that no longer opens stops the request with its name. A missing or unknown type is read from the address.
 */
export async function readMorePages(raw: unknown, fetchHop: FetchHop = webHop): Promise<MoreRead> {
  const pages: Extract<MoreRead, { ok: true }>["pages"] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_MORE) : []) {
    const page = (item ?? {}) as Record<string, unknown>;
    const label = text(page.label, 40).trim();
    if (!label) return { ok: false, label: null };
    const url = typeof page.url === "string" ? await checkAddress(page.url, fetchHop) : null;
    if (!url) return { ok: false, label };
    const kind = page.kind;
    const type = typeof page.page === "string" && page.page in PAGE_INSTRUCTIONS ? (page.page as PageType) : null;
    if (kind === "pricing" || kind === "changelog") pages.push({ kind, url, label });
    else if (kind === "page" && type) pages.push({ kind, url, label, page: type });
    else pages.push(morePage(url, label));
  }
  return { ok: true, pages };
}
