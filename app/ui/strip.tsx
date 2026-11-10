import type { ReactNode } from "react";

/**
 * A status row: counts and states on the left, times (`end`) on the right, on the status background
 * so the eye knows it at a glance. The readout strip under a header and the Feed's header both use it.
 */
export function Strip({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <section className="text-small flex min-h-10 flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-rule bg-status px-(--gutter) py-2 text-muted">
      {children}
      {end && <span className="ml-auto flex flex-wrap items-baseline justify-end gap-x-5 gap-y-1.5">{end}</span>}
    </section>
  );
}

/**
 * One readout: a muted label, then its value in bold. "Competitors 3", "Last change 2 days ago".
 * Every strip uses this one order, so readouts never mix "Label 3" with "3 things".
 */
export function Stat({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap" title={title}>
      {children}
    </span>
  );
}

export function Value({ children }: { children: ReactNode }) {
  return <span className="figures text-body font-semibold text-ink">{children}</span>;
}

/** The colour of a watch's state, on every status dot. */
export const STATE_COLOR = { working: "#0E9F6E", setting_up: "#9AA3B0", unknown: "#9AA3B0", not_working: "#DC6803" } as const;

export function Pill({ color, title, warn = false, children }: { color: string; title?: string; warn?: boolean; children: ReactNode }) {
  return (
    <span
      title={title}
      className={`text-small inline-flex h-6 items-center gap-1.5 rounded-full border bg-white px-2.5 whitespace-nowrap ${
        warn ? "border-warn-edge/40 text-warn" : "border-rule text-ink"
      }`}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
