"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSheet } from "./sheet";

/**
 * A centered modal for a decision that deserves its own moment (more than a row in a panel).
 * Fades and scales in, closes on Escape, the X or a click outside, and stops the page behind from scrolling.
 * Mount it to open it, and pass onClose to unmount it after it closes.
 * Rendered on document.body: inside a sliding panel (a CSS transform), position: fixed would be boxed into the panel.
 */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { shown, close } = useSheet(onClose, { topmost: true });
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={close}
        className={`ui-overlay absolute inset-0 bg-[#1B2430]/35 ${shown ? "is-open" : ""}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`ui-modal relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[480px] flex-col rounded-[10px] border border-rule bg-white shadow-[0_16px_48px_rgba(27,36,48,0.18)] ${shown ? "is-open" : ""}`}
      >
        <div className="flex h-12 shrink-0 items-center border-b border-rule px-5">
          <h2 className="text-heading mr-auto font-semibold">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-panel-2 hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-rule bg-panel px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
