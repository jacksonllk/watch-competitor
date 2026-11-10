/**
 * Key-value store for saved news, the preview cache and the alert cursor.
 * Values must be JSON-serialisable. Every adapter writes under KEY_PREFIX, so the
 * store can share a database with other apps.
 */
export interface Store {
  /** The value, or null when the key is missing or expired. */
  get<T>(key: string): Promise<T | null>;
  /** Saves the value. With ttlSeconds, it expires after that many seconds. */
  set<T>(key: string, value: T, options?: { ttlSeconds?: number }): Promise<void>;
  /** Removes the key. A missing key is not an error. */
  delete(key: string): Promise<void>;
}

/** Every key this app writes starts with this. The Upstash database is shared with another app. */
// The app's original name (renamed Watch Competitor on 10 Nov 2026), kept so saved data keeps loading: every stored key starts with it.
export const KEY_PREFIX = "competitor-watch:";

export function prefixed(key: string): string {
  if (!key) throw new Error("Store key must not be empty");
  return KEY_PREFIX + key;
}

/** Throws unless ttlSeconds is missing or a whole number of 1 or more. Redis expiry works in whole seconds. */
export function checkTtl(ttlSeconds?: number): void {
  if (ttlSeconds === undefined) return;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new Error("ttlSeconds must be a whole number of seconds, 1 or more");
  }
}

export function expiresAt(now: number, ttlSeconds?: number): number | null {
  checkTtl(ttlSeconds);
  return ttlSeconds === undefined ? null : now + ttlSeconds * 1000;
}
