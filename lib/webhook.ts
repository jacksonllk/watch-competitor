/**
 * Real-time updates when deployed: each monitor sends a signed `run.completed` event to the app the moment a
 * check finishes (context.dev docs: monitors/webhooks, webhooks). The app answers at once, then reads the result.
 * Off when APP_URL is missing or not a public https address, such as on a laptop. The app then reads on its own
 * schedule (lib/refresh.ts), which works everywhere.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Store } from "./store/types";

export const WEBHOOK_PATH = "/api/webhooks/context-dev";
export const WEBHOOK_SECRETS = "webhook-secrets";
/** context.dev can replay an event for 7 days. Remember event IDs a little longer. */
const SEEN_SECONDS = 8 * 24 * 60 * 60;
/** Signatures older than this are rejected (context.dev's own example uses 5 minutes). */
const MAX_AGE_SECONDS = 300;

/** The address context.dev should send events to, or null when the app is not reachable from the internet. */
export function webhookUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.APP_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) || url.hostname.endsWith(".local");
  if (url.protocol !== "https:" || local) return null;
  return `${url.origin}${WEBHOOK_PATH}`;
}

/**
 * Checks `X-Context-Signature: t=<unix>,v1=<hex>`: HMAC-SHA256 of "<t>.<raw body>" with the monitor's secret,
 * compared in constant time, and no older than 5 minutes. Returns true when any of the secrets signed it.
 */
export function verifySignature(rawBody: string, header: string | null, secrets: string[], nowSeconds = Date.now() / 1000): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=") as [string, string]));
  if (!/^\d+$/.test(parts.t ?? "") || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? "")) return false;
  if (Math.abs(nowSeconds - Number(parts.t)) > MAX_AGE_SECONDS) return false;
  const actual = Buffer.from(parts.v1, "hex");
  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(`${parts.t}.`).update(rawBody).digest();
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

/** Each monitor's signing secret, saved when the webhook is set. Kept in the app's own store. */
export async function loadSecrets(store: Store): Promise<Record<string, string>> {
  return (await store.get<Record<string, string>>(WEBHOOK_SECRETS)) ?? {};
}

export async function saveSecrets(store: Store, secrets: Record<string, string>): Promise<void> {
  await store.set(WEBHOOK_SECRETS, secrets);
}

/** True the first time an event ID is seen. Retries and replays of the same event return false. */
export async function firstTime(store: Store, eventId: string): Promise<boolean> {
  const key = `webhook:seen:${eventId}`;
  if (await store.get(key)) return false;
  await store.set(key, true, { ttlSeconds: SEEN_SECONDS });
  return true;
}
