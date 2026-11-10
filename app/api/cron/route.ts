import { afterRefresh } from "@/lib/background";
import { refresh } from "@/lib/refresh";
import { setup, setupError } from "@/lib/server";

/**
 * For any scheduler (Vercel Cron, GitHub Actions, crontab): saves new changes, runs the daily news check and sends
 * Slack alerts. Call it with "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET set, the route is off.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ status: "off" }, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ status: "unauthorized" }, { status: 401 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const result = await refresh(ready.store, ready.api.monitors, { force: true });
  return Response.json({ ...result, ...(await afterRefresh(ready.store, ready.api)) });
}
