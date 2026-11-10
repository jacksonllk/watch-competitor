"use client";

/**
 * Cards that show at once on hover or focus, with no browser-tooltip delay. One look everywhere: the timeline's
 * change cards, the monitors status card, the watch pills. Placed above the anchor, or below when there is no room.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type CardProps = {
  rect: DOMRect;
  children: ReactNode;
  /** Interactive cards take the pointer, so their links can be clicked. Others let it pass through. */
  interactive?: boolean;
  /** Fixed width in pixels. Without one the card fits its content, up to 320px. */
  width?: number;
  /** A one-line label, such as a name: smaller padding. */
  compact?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

export function FloatingCard({ rect, children, interactive = false, width, compact = false, onPointerEnter, onPointerLeave }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - box.width / 2), window.innerWidth - box.width - 8);
    const above = rect.top - box.height - 6;
    const below = rect.bottom + 6;
    // Below first when it fits, for cards opened from the top of the page. Above otherwise.
    const fitsBelow = below + box.height <= window.innerHeight - 8;
    setPos({ left, top: interactive && fitsBelow ? below : above >= 8 ? above : below });
  }, [rect, interactive]);
  return createPortal(
    <div
      ref={ref}
      role={interactive ? "dialog" : "tooltip"}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocusCapture={onPointerEnter}
      className={`${interactive ? "" : "pointer-events-none"} fixed z-50 max-w-[min(320px,calc(100vw-16px))] rounded-[8px] border border-rule bg-white shadow-[0_8px_24px_rgba(16,24,40,0.12)] ${
        compact ? "text-small px-2.5 py-1.5 font-semibold whitespace-nowrap text-ink" : "p-3"
      }`}
      // Never wider than the screen less 8px a side: a 380px card on a 375px phone touched the edge (10 Nov).
      style={{
        width,
        maxWidth: width ? `min(${width}px, calc(100vw - 16px))` : undefined,
        ...(pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * Wraps a trigger. Hover or focus shows the card at once. An interactive card stays while the pointer crosses into it,
 * and a click on the trigger keeps it open until a click outside or Escape. On a phone a tap opens it.
 */
export function HoverCard({
  card,
  children,
  interactive = false,
  width,
  compact = false,
  className = "",
}: {
  card: ReactNode;
  children: ReactNode;
  interactive?: boolean;
  width?: number;
  compact?: boolean;
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    cancel();
    if (anchor.current) setRect(anchor.current.getBoundingClientRect());
  };
  const hide = (now = !interactive) => {
    cancel();
    if (pinned) return;
    if (now) setRect(null);
    else timer.current = setTimeout(() => setRect(null), 150);
  };
  useEffect(() => {
    if (!rect) return;
    const close = () => {
      if (timer.current) clearTimeout(timer.current);
      setPinned(false);
      setRect(null);
    };
    const onScroll = () => close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !(t instanceof Element && t.closest("[role=dialog],[role=tooltip]"))) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [rect]);

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className}`}
      onPointerDown={(e) => (touch.current = e.pointerType === "touch")}
      onPointerEnter={(e) => e.pointerType !== "touch" && show()}
      onPointerLeave={(e) => e.pointerType !== "touch" && hide()}
      onFocus={() => !touch.current && show()}
      onBlur={() => hide()}
      onClickCapture={(e) => {
        // A tap on a phone opens the card first. A click on a desktop pins an interactive card open.
        if (touch.current && !rect) {
          e.preventDefault();
          show();
        } else if (interactive && !touch.current) setPinned(true);
      }}
    >
      {children}
      {rect && (
        <FloatingCard rect={rect} interactive={interactive} width={width} compact={compact} onPointerEnter={cancel} onPointerLeave={() => hide()}>
          {card}
        </FloatingCard>
      )}
    </span>
  );
}
