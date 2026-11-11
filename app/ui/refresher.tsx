"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ASK_EVERY_MS = 60_000;
/** While a first check runs (fast), ask every 10 seconds: the server reads every 15 seconds then. */
const FAST_EVERY_MS = 10_000;

/**
 * Keeps an open page current: asks the server to update from context.dev after the page shows, then once a minute
 * while the tab is visible (every 10 seconds while a first check runs). The server updates at most every 5 minutes
 * (15 seconds during a first check), and only with free reads.
 */
/** at: when the data on this page was last updated. A newer time from the server means something else updated it. */
export function Refresher({ stale, fast = false, at = null }: { stale: boolean; fast?: boolean; at?: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/refresh", { method: "POST" })
        .then((r) => r.json())
        .then((body: { status: string; savedChanges?: number; changedStates?: boolean; at?: string | null }) => {
          if (!alive) return;
          // Redraw after any update, so "Updated … ago" and the statuses stay true. The page renders from the store in under 100 ms.
          // Also when the data changed since this page was drawn (a webhook did it), even if this request found it fresh.
          if (body.status === "failed" || body.status === "refreshed" || (body.at && body.at !== at)) router.refresh();
        })
        .catch(() => {});
    };
    if (stale) ask();
    const timer = setInterval(ask, fast ? FAST_EVERY_MS : ASK_EVERY_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [stale, fast, at, router]);
  return null;
}
