import { loadCompetitors } from "@/lib/competitors";
import { loadConfig } from "@/lib/config";
import { normalizeDomain, previewCompany } from "@/lib/preview";
import { jsonBody, setup, setupError, text } from "@/lib/server";

/** Description, 90 days of news and the pages found on the site. Also the free monitor slot count and the base instructions. */
export async function POST(request: Request) {
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const body = await jsonBody(request);
  const domain = text(body?.domain, 253);
  if (!domain) return Response.json({ status: "failed" }, { status: 400 });
  const [result, limits, competitors] = await Promise.all([
    previewCompany(ready.store, ready.api, domain, { query: text(body?.query, 100) || undefined }),
    Promise.resolve(ready.api.monitors.getLimits()).catch(() => null),
    loadCompetitors(ready.store),
  ]);
  const watching = competitors.some((c) => c.domain === normalizeDomain(domain) && c.status === "watching");
  return Response.json({
    ...result,
    instructions: loadConfig().instructions,
    watching,
    monitors: limits ? { used: limits.monitors_used, limit: limits.monitors_limit } : null,
  });
}
