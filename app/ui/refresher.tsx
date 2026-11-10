"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ASK_EVERY_MS = 60_000;

/**
 * Keeps an open page current: asks the server to update from context.dev after the page shows, then once a minute
 * while the tab is visible. The server updates at most every 5 minutes, and only with free reads.
 */
export function Refresher({ stale }: { stale: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/refresh", { method: "POST" })
        .then((r) => r.json())
        .then((body: { status: string; savedChanges?: number; changedStates?: boolean }) => {
          if (!alive) return;
          // Redraw after any update, so "Updated … ago" and the statuses stay true. The page renders from the store in under 100 ms.
          if (body.status === "failed" || body.status === "refreshed") router.refresh();
        })
        .catch(() => {});
    };
    if (stale) ask();
    const timer = setInterval(ask, ASK_EVERY_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [stale, router]);
  return null;
}
