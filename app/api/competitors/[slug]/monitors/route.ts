import { addMonitors, removeMonitor } from "@/lib/competitor-actions";
import { loadConfig } from "@/lib/config";
import { failureOf } from "@/lib/context";
import { isDemo } from "@/lib/links";
import { watchForResults } from "@/lib/refresh";
import { jsonBody, readMorePages, setup, setupError, text } from "@/lib/server";
import { webhookUrl } from "@/lib/webhook";

/** Add monitors: checks each address opens (free), then creates a monitor per page. Each first check costs 1 credit. */
export async function POST(request: Request, ctx: RouteContext<"/api/competitors/[slug]/monitors">) {
  // The public demo never creates, checks, removes or deletes anything on its key.
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const { slug } = await ctx.params;
  const read = await readMorePages((await jsonBody(request))?.more);
  if (!read.ok) return Response.json(read.label ? { status: "page_not_found", label: read.label } : { status: "failed" }, { status: 400 });
  try {
    const config = loadConfig();
    const result = await addMonitors(ready.store, ready.api.monitors, slug, read.pages, {
      instructions: config.instructions,
      schedule: config.schedule,
      webhookUrl: webhookUrl(),
    });
    // Read every 15 seconds until the new pages' first checks are done, so they show within seconds.
    if (result.status === "added") await watchForResults(ready.store, new Date(), { firstChecks: true });
    const ok = result.status === "added" || result.status === "already_watched";
    return Response.json(result.status === "added" ? { status: "added", count: result.count } : result, {
      status: ok ? 200 : result.status === "no_monitor_slots" ? 409 : 404,
    });
  } catch (error) {
    const failure = failureOf(error);
    if (failure.status === 402) return Response.json({ status: "out_of_credits", nextRefillAt: failure.nextRefillAt }, { status: 402 });
    console.error("Add monitors failed", failure);
    return Response.json({ status: "failed" }, { status: 502 });
  }
}

/** Remove a monitor: saves its changes, then deletes it in context.dev (free). Its changes stay on the timeline. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/competitors/[slug]/monitors">) {
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const { slug } = await ctx.params;
  const monitorId = text((await jsonBody(request))?.monitorId, 100);
  if (!monitorId) return Response.json({ status: "failed" }, { status: 400 });
  try {
    const result = await removeMonitor(ready.store, ready.api.monitors, slug, monitorId);
    return Response.json({ status: result.status }, { status: result.status === "removed" ? 200 : 404 });
  } catch (error) {
    console.error("Remove monitor failed", failureOf(error));
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
