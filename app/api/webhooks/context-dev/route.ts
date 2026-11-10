import { after } from "next/server";
import { afterRefresh } from "@/lib/background";
import { refresh } from "@/lib/refresh";
import { setup } from "@/lib/server";
import { firstTime, loadSecrets, reloadSecrets, verifySignature } from "@/lib/webhook";

/**
 * Receives context.dev's "run finished" events (only when the app has a public address, see lib/webhook.ts).
 * Verifies the signature against every monitor's secret before reading the body, answers at once,
 * then reads the result in the background with the same free calls as the scheduled read.
 */
export async function POST(request: Request) {
  const ready = setup();
  if (!ready.ok) return new Response(null, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-context-signature");
  if (!verifySignature(raw, signature, Object.values(await loadSecrets(ready.store)))) {
    // A rotated secret is not saved yet: read the current ones from context.dev (at most every 5 minutes), then check again.
    const fresh = await reloadSecrets(ready.store, ready.api.monitors).catch(() => null);
    if (!fresh || !verifySignature(raw, signature, fresh)) return new Response(null, { status: 401 });
  }
  const eventId = request.headers.get("x-context-id");
  // Retries and replays carry the same ID: handle each event once.
  if (eventId && !(await firstTime(ready.store, eventId))) return new Response(null, { status: 200 });

  after(async () => {
    await refresh(ready.store, ready.api.monitors, { force: true });
    await afterRefresh(ready.store, ready.api);
  });
  return new Response(null, { status: 200 });
}
