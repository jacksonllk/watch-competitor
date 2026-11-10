import { isDemo } from "@/lib/links";
import { checkNow } from "@/lib/competitor-actions";
import { watchForResults } from "@/lib/refresh";
import { failureOf } from "@/lib/context";
import { setup, setupError } from "@/lib/server";

/** Check now: runs each page monitor once. 1 credit per page, charged on the run. */
export async function POST(_req: Request, ctx: RouteContext<"/api/competitors/[slug]/check">) {
  // The public demo never creates, checks, removes or deletes anything on its key.
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const { slug } = await ctx.params;
  try {
    const result = await checkNow(ready.store, ready.api.monitors, slug);
    // Read every 5 minutes for the next 20 minutes, so the result shows soon.
    if (result.status === "started") await watchForResults(ready.store);
    return Response.json(result, { status: result.status === "started" ? 200 : 404 });
  } catch (error) {
    const failure = failureOf(error);
    if (failure.status === 402) return Response.json({ status: "out_of_credits", nextRefillAt: failure.nextRefillAt }, { status: 402 });
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
