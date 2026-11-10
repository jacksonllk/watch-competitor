import { refresh } from "@/lib/refresh";
import { setup, setupError } from "@/lib/server";

/** Saves new changes and watch states. Free. Runs at most once every 5 minutes, so opening pages never piles up calls. */
export async function POST() {
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  return Response.json(await refresh(ready.store, ready.api.monitors));
}
