"use client";

/**
 * A time as people say it ("2 hours ago", "in 55 minutes") that keeps counting while the page is open.
 * Recounted every 15 seconds, so it is right to the minute. The server writes the first value; the browser takes over.
 * next: a time the app is waiting for (the next check). Under a minute away it says "in under a minute",
 * and once passed it says "now" until the page's next update brings the new time.
 */
import { useEffect, useState } from "react";
import { relative } from "./format";

const EVERY_MS = 15_000;

export function Ago({ iso, next = false }: { iso: string; next?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  const left = Date.parse(iso) - now;
  const text = next && left <= 0 ? "now" : next && left < 60_000 ? "in under a minute" : relative(iso, new Date(now));
  // The server's clock and the browser's differ by a few seconds, so the first text may differ by a minute.
  return <span suppressHydrationWarning>{text}</span>;
}
