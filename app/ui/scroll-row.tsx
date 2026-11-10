"use client";

import { useEffect, useRef, useState } from "react";

/** A row that scrolls sideways instead of wrapping. Its edges fade where more is hidden. */
/** bleed: on narrow screens the row runs to the screen edges (the Overview toolbar). Off when something sits beside the row. */
export function ScrollRow({ label, children, bleed = true }: { label: string; children: React.ReactNode; bleed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setFade({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
  const mask = `linear-gradient(to right, ${fade.left ? "transparent 0, #000 32px" : "#000 0"}, ${fade.right ? "#000 calc(100% - 32px), transparent 100%" : "#000 100%"})`;
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={`ui-scroll-x relative flex min-w-0 items-center gap-1.5 overflow-x-auto ${bleed ? "-mx-(--gutter) px-(--gutter) lg:mx-0 lg:flex-1 lg:px-0" : ""}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </div>
  );
}
