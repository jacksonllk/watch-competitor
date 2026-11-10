import { isDemo } from "@/lib/links";
import { deleteHistory } from "@/lib/competitor-actions";
import { getStore } from "@/lib/store";

/** Delete history: removes a removed competitor and everything saved about it. No context.dev call. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/competitors/[slug]">) {
  // The public demo never creates, checks, removes or deletes anything on its key.
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const { store } = getStore();
  if (!store) return Response.json({ status: "setup_needed" }, { status: 503 });
  const { slug } = await ctx.params;
  const result = await deleteHistory(store, slug);
  return Response.json(result, { status: result.status === "deleted" ? 200 : 409 });
}
