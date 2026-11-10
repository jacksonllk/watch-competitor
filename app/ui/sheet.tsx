"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

const SHEET_MS = 240;

/**
 * Open and close a side panel smoothly: slides in on the next frame, slides out before it unmounts,
 * closes on Escape, and stops the page behind from scrolling. Mount the panel to open it.
 */
export function useSheet(onClose: () => void, options: { topmost?: boolean } = {}) {
  const topmost = options.topmost ?? false;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
    };
  }, []);
  const close = useCallback(() => {
    setShown(false);
    setTimeout(onClose, SHEET_MS);
  }, [onClose]);
  // A modal on top of a panel takes Escape first and stops it, so one press closes only the top layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (topmost) e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, topmost);
    return () => window.removeEventListener("keydown", onKey, topmost);
  }, [close, topmost]);
  return { shown, close };
}

/** A side panel from the right: title bar with a close button, a scrolling body, an optional footer. Full width on phones. */
export function Sheet({
  title,
  shown,
  onClose,
  footer,
  children,
}: {
  title: string;
  shown: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`ui-overlay absolute inset-0 bg-[#1B2430]/25 ${shown ? "is-open" : ""}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`ui-sheet relative flex h-full w-full flex-col border-l border-rule bg-white shadow-[-8px_0_32px_rgba(27,36,48,0.10)] sm:max-w-[440px] ${shown ? "is-open" : ""}`}
      >
        <div className="flex h-12 shrink-0 items-center border-b border-rule px-5">
          <h2 className="text-heading mr-auto font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-panel-2 hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <footer className="ui-fade-in border-t border-rule bg-panel px-5 py-3.5">{footer}</footer>}
      </aside>
    </div>
  );
}
