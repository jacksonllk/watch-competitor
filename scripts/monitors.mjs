// Lists this app's monitors in context.dev with their state: npm run monitors
// Prints no secrets: each monitor's webhook signing secret is dropped before anything is printed.
// Reads only (one free list call). Needs CONTEXT_DEV_API_KEY in .env.
import ContextDev from "context.dev";

const APP_TAG = "competitor-watch"; // lib/context.ts: the app's original name, kept for the live monitors
const client = new ContextDev({ apiKey: process.env.CONTEXT_DEV_API_KEY });
const list = await client.monitors.list({ tag: APP_TAG, limit: 100 });
const rows = list.data.map((m) => ({
  name: m.name,
  status: m.status,
  lastRun: m.last_run_at,
  nextRun: m.next_run_at,
  lastError: m.last_error ?? "",
  webhook: m.webhook?.url ?? "none",
  webhookFailing: m.webhook_failure ? "yes" : "",
}));
console.table(rows);
