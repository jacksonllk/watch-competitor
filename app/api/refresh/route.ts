import { afterRefresh } from "@/lib/background";
import { loadSavedStates, refresh } from "@/lib/refresh";
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
  // at: when the data was last updated, by this request or anything else (a webhook, another tab). The open page
  // redraws when it differs from what it shows. A news check that saved articles counts as an update too.
  const at = (await loadSavedStates(ready.store))?.at ?? null;
  return Response.json(result.status === "fresh" && after.newsChecked ? { status: "refreshed", news: after.newsChecked, at } : { ...result, at });
}
