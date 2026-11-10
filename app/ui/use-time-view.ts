"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** What the timeline shows: `span` days starting at day `start`. Fractional while it moves, whole days at rest. */
export type View = { start: number; span: number };

export type TimeView = {
  view: View;
  /** The view right now, for event handlers that run between renders. */
  current: () => View;
  /** Moves at once, such as under a dragging pointer. `soft` lets it stretch a little past either end. */
  set: (next: View, soft?: boolean) => void;
  /** Glides to whole days. Every button, key and drop ends here. */
  animateTo: (next: View, ms?: number) => void;
  /** Lowest and highest day numbers the view may cover: [min, max). */
  bounds: { min: number; max: number };
};

const ease = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * The timeline's view, shared by the range button, the zoom buttons, the lanes and the history bar,
 * so every control moves the same view and the Feed follows it.
 */
export function useTimeView(initial: View, min: number, max: number): TimeView {
  const [view, setView] = useState(initial);
  const ref = useRef(initial);
  const frame = useRef<number | null>(null);
  const bounds = useMemo(() => ({ min, max }), [min, max]);

  const apply = useCallback((v: View) => {
    ref.current = v;
    setView(v);
  }, []);

  const clamp = useCallback(
    (v: View, soft = false): View => {
      const span = Math.min(Math.max(v.span, 1), max - min);
      const lo = min;
      const hi = max - span;
      let start = v.start;
      // Past either end the view follows the pointer at a third of its speed, at most 3 days, then springs back on release.
      if (soft && start < lo) start = lo - Math.min(lo - start, 9) / 3;
      else if (soft && start > hi) start = hi + Math.min(start - hi, 9) / 3;
      else start = Math.min(Math.max(start, lo), hi);
      return { start, span };
    },
    [min, max],
  );

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const set = useCallback(
    (next: View, soft = false) => {
      stop();
      apply(clamp(next, soft));
    },
    [apply, clamp],
  );

  const animateTo = useCallback(
    (next: View, ms = 280) => {
      stop();
      const span = Math.round(next.span);
      const target = clamp({ start: Math.round(next.start), span });
      const from = ref.current;
      const still = Math.abs(from.start - target.start) < 0.001 && Math.abs(from.span - target.span) < 0.001;
      if (still || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply(target);
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const e = ease(p);
        apply(p < 1 ? { start: from.start + (target.start - from.start) * e, span: from.span + (target.span - from.span) * e } : target);
        frame.current = p < 1 ? requestAnimationFrame(step) : null;
      };
      frame.current = requestAnimationFrame(step);
    },
    [apply, clamp],
  );

  useEffect(() => stop, []);

  const current = useCallback(() => ref.current, []);
  return { view, current, set, animateTo, bounds };
}
