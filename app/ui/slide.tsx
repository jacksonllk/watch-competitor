"use client";

import { useEffect, useState, type ReactNode } from "react";

/** The last value shown, kept across client navigations. */
let lastShown: string | null = null;

/**
 * Slides its children in from the side the user moved to when `value` changes, such as the week.
 * Give it `key={value}` so it mounts again for each new value. ISO dates compare as strings.
 * With `scoped`, only descendants with the class `ui-slide-item` move.
 */
export function Slide({
  value,
  children,
  className = "",
  scoped = false,
}: {
  value: string;
  children: ReactNode;
  className?: string;
  scoped?: boolean;
}) {
  const [dir] = useState(() => (lastShown && lastShown !== value ? (value > lastShown ? "next" : "prev") : null));
  useEffect(() => {
    lastShown = value;
  }, [value]);
  // scoped: only children marked .ui-slide-item move, such as day cells next to fixed row labels.
  const motion = dir ? (scoped ? `ui-slide-scope-${dir}` : `ui-slide-${dir}`) : "";
  return <div className={`${className} ${motion}`}>{children}</div>;
}
