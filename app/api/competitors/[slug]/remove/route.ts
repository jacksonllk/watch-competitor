import { isDemo } from "@/lib/links";
import { removeCompetitor } from "@/lib/competitor-actions";
import { setup, setupError } from "@/lib/server";

/** Remove: saves every change, then deletes the monitors (free). The saved timeline stays. */
export async function POST(_req: Request, ctx: RouteContext<"/api/competitors/[slug]/remove">) {
  // The public demo never creates, checks, removes or deletes anything on its key.
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const { slug } = await ctx.params;
  try {
    const result = await removeCompetitor(ready.store, ready.api.monitors, slug);
    return Response.json(result, { status: result.status === "removed" ? 200 : 404 });
  } catch {
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
