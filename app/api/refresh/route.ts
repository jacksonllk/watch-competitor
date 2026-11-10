import { afterRefresh } from "@/lib/background";
import { refresh } from "@/lib/refresh";
import { setup, setupError } from "@/lib/server";

/**
 * Saves new changes and watch states (free, at most once every 5 minutes), then runs the daily news check for anyone
 * due and sends Slack alerts for anything new.
 */
export async function POST() {
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const result = await refresh(ready.store, ready.api.monitors);
  const after = await afterRefresh(ready.store, ready.api);
  // A news check that saved articles counts as an update, so the open page redraws.
  return Response.json(result.status === "fresh" && after.newsChecked ? { status: "refreshed", news: after.newsChecked } : result);
}
