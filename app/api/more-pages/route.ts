import { findMorePages } from "@/lib/find-pages";
import { normalizeDomain, previewKey, type Preview } from "@/lib/preview";
import { jsonBody, text } from "@/lib/server";
import { getStore } from "@/lib/store";

/**
 * Recommended extra pages for Add more monitors. Free: plain requests to the competitor's site and the cached preview,
 * no context.dev call, so it works in the demo too.
 */
export async function POST(request: Request) {
  const body = await jsonBody(request);
  const domain = normalizeDomain(text(body?.domain, 253) ?? "");
  if (!domain) return Response.json({ status: "failed" }, { status: 400 });
  const chosen = Array.isArray(body?.chosen)
    ? (body.chosen as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 20)
    : [];
  const store = getStore().store;
  const preview = store ? await store.get<Preview>(previewKey(domain)) : null;
  const pages = await findMorePages(domain, preview?.pages ?? null, chosen);
  return Response.json({ status: "ok", pages });
}
