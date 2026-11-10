import { editAddress } from "@/lib/competitor-actions";
import { loadConfig } from "@/lib/config";
import { failureOf } from "@/lib/context";
import { checkAddress } from "@/lib/find-pages";
import { isDemo } from "@/lib/links";
import { watchForResults } from "@/lib/refresh";
import { jsonBody, setup, setupError, text } from "@/lib/server";

/** Edit address: checks the new address opens (free), then points the monitor at it. Its new first check costs 1 credit. */
export async function POST(request: Request, ctx: RouteContext<"/api/competitors/[slug]/address">) {
  // The public demo never creates, checks, removes or deletes anything on its key.
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const { slug } = await ctx.params;
  const body = await jsonBody(request);
  const monitorId = text(body?.monitorId, 100);
  const url = await checkAddress(text(body?.url, 2000));
  if (!monitorId) return Response.json({ status: "failed" }, { status: 400 });
  if (!url) return Response.json({ status: "page_not_found" }, { status: 400 });
  try {
    const result = await editAddress(ready.store, ready.api.monitors, slug, monitorId, url, { instructions: loadConfig().instructions });
    // Read every 15 seconds until the new address's first check is done, so it shows within seconds.
    if (result.status === "updated") await watchForResults(ready.store, new Date(), { firstChecks: true });
    return Response.json(result.status === "updated" ? { status: "updated", url } : result, { status: result.status === "updated" ? 200 : 404 });
  } catch (error) {
    const failure = failureOf(error);
    if (failure.status === 402) return Response.json({ status: "out_of_credits", nextRefillAt: failure.nextRefillAt }, { status: 402 });
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
