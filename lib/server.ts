/** What every route and page needs: the store, the context.dev client and the settings file. Server only. */
import { liveApi, type ContextApi } from "./context";
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
