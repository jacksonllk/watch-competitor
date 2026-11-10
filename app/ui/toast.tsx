"use client";

import { useCallback, useEffect, useState } from "react";

const TOAST_MS = 4000;

/** One short notice at a time. notify("Now watching Runloop.") shows it for 4 seconds. */
export function useToast() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  return { toast, notify };
}

export function Toast({ toast }: { toast: { id: number; text: string } | null }) {
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="ui-toast text-body fixed right-4 bottom-4 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-[8px] bg-ink px-4 py-3 text-white shadow-lg"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {toast.text}
    </div>
  );
}
