"use client";

/**
 * The date range button and its calendar. Presets on the left, two months on the right (one on a phone).
 * Pick a start day, then an end day: the timeline and the Feed move there at once. Days with saved changes have a dot.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dayOfMonth, daysText, MONTHS_LONG, monthOf, monthStart, rangeText, weekday, yearOf } from "./time";

type Props = {
  from: number;
  to: number;
  today: number;
  earliest: number;
  /** Day numbers with at least one change. */
  activity: Set<number>;
  /** True when no zoom button matches the range, so the button says how many days it covers. */
  custom: boolean;
  onPick: (from: number, to: number) => void;
  className?: string;
};

export function RangePicker({ from, to, today, earliest, activity, custom, onPick, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${className} text-body flex h-8 items-center gap-2 rounded-[6px] border bg-white px-2.5 text-ink ${open ? "border-edge" : "border-rule hover:border-edge"}`}
      >
        <CalendarIcon />
        <span className="figures btn-label whitespace-nowrap">{rangeText(from, to, today)}</span>
        {custom && <span className="figures btn-label hidden whitespace-nowrap text-muted sm:inline">{daysText(to - from + 1)}</span>}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          className="ml-auto shrink-0 text-muted"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <Panel
          anchor={button}
          from={from}
          to={to}
          today={today}
          earliest={earliest}
          activity={activity}
          onClose={() => setOpen(false)}
          onPick={(a, b) => {
            onPick(a, b);
            setOpen(false);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Panel({
  anchor,
  from,
  to,
  today,
  earliest,
  activity,
  onClose,
  onPick,
}: Omit<Props, "custom" | "className"> & { anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // The right-hand month. The left one is the month before it.
  const [month, setMonth] = useState(() => monthStart(to));
  const [first, setFirst] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const box = panel.current?.getBoundingClientRect();
      if (!a || !box) return;
      const left = Math.min(Math.max(8, a.right - box.width), window.innerWidth - box.width - 8);
      setPos({ left: left + window.scrollX, top: a.bottom + 6 + window.scrollY });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  useEffect(() => {
    panel.current?.focus();
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
      anchor.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);

  const clampStart = (n: number) => Math.max(n, earliest);
  const presets = [
    { label: "Last 7 days", from: today - 6, to: today },
    { label: "Last 30 days", from: today - 29, to: today },
    { label: "Last 60 days", from: today - 59, to: today },
    { label: "Last 90 days", from: today - 89, to: today },
    { label: "This month", from: monthStart(today), to: today },
    { label: "Last month", from: monthStart(today, -1), to: monthStart(today) - 1 },
    { label: "All history", from: earliest, to: today },
  ].map((p) => ({ ...p, from: clampStart(p.from) }));

  // While picking, the range runs from the first day to the day under the pointer.
  const [lo, hi] = first === null ? [from, to] : [Math.min(first, hover ?? first), Math.max(first, hover ?? first)];
  const pick = (n: number) => {
    if (first === null) {
      setFirst(n);
      setHover(n);
    } else onPick(Math.min(first, n), Math.max(first, n));
  };

  const canBack = month - 1 >= monthStart(earliest, 1);
  const canForward = month < monthStart(today);

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Choose dates"
      tabIndex={-1}
      className="ui-pop absolute z-50 flex w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[10px] border border-rule bg-white shadow-[0_12px_32px_rgba(16,24,40,0.14)] outline-none sm:w-auto sm:flex-row"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <div className="flex flex-wrap gap-1 border-b border-rule p-2 sm:w-[156px] sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              type="button"
              disabled={p.to < earliest}
              onClick={() => onPick(p.from, p.to)}
              className={`text-body h-8 rounded-[6px] px-2.5 text-left whitespace-nowrap ${
                active ? "bg-ink font-semibold text-white" : "text-copy hover:bg-panel-2 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col">
        <div className="flex gap-6 p-3 sm:p-4">
          <div className="hidden sm:block">
            <Month
              first={monthStart(month, -1)}
              lo={lo}
              hi={hi}
              today={today}
              earliest={earliest}
              activity={activity}
              onPick={pick}
              onHover={setHover}
              nav={<NavButton dir="back" disabled={!canBack} onClick={() => setMonth(monthStart(month, -1))} />}
            />
          </div>
          <Month
            first={month}
            lo={lo}
            hi={hi}
            today={today}
            earliest={earliest}
            activity={activity}
            onPick={pick}
            onHover={setHover}
            nav={
              <>
                <span className="sm:hidden">
                  <NavButton dir="back" disabled={month <= monthStart(earliest)} onClick={() => setMonth(monthStart(month, -1))} />
                </span>
                <NavButton dir="forward" disabled={!canForward} onClick={() => setMonth(monthStart(month, 1))} />
              </>
            }
          />
        </div>
        <div className="text-small flex items-center gap-3 border-t border-rule px-4 py-2.5">
          <span className="figures font-semibold text-ink">{rangeText(lo, hi, today)}</span>
          <span className="figures text-muted">{daysText(hi - lo + 1)}</span>
          <span className="ml-auto text-muted">{first === null ? "Pick a start day." : "Now pick the end day."}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Month({
  first,
  lo,
  hi,
  today,
  earliest,
  activity,
  onPick,
  onHover,
  nav,
}: {
  first: number;
  lo: number;
  hi: number;
  today: number;
  earliest: number;
  activity: Set<number>;
  onPick: (n: number) => void;
  onHover: (n: number | null) => void;
  nav: React.ReactNode;
}) {
  const days = monthStart(first, 1) - first;
  const lead = weekday(first);
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => first + i)];
  return (
    <div className="w-full sm:w-[252px]">
      <div className="mb-2 flex h-7 items-center justify-between">
        <span className="text-body font-semibold text-ink">
          {MONTHS_LONG[monthOf(first)]} {yearOf(first)}
        </span>
        <span className="flex items-center gap-0.5">{nav}</span>
      </div>
      <div className="text-label grid grid-cols-7 text-center text-muted">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => onHover(null)}>
        {cells.map((n, i) => {
          if (n === null) return <span key={`b${i}`} />;
          const off = n < earliest || n > today;
          const inside = n >= lo && n <= hi;
          const end = n === lo || n === hi;
          return (
            <span
              key={n}
              className={`relative h-9 ${inside ? "bg-panel-2" : ""} ${n === lo ? "rounded-l-[6px]" : ""} ${n === hi ? "rounded-r-[6px]" : ""}`}
            >
              <button
                type="button"
                disabled={off}
                onClick={() => onPick(n)}
                onMouseEnter={() => onHover(n)}
                onFocus={() => onHover(n)}
                aria-label={`${dayOfMonth(n)} ${MONTHS_LONG[monthOf(n)]} ${yearOf(n)}${activity.has(n) ? ", has changes" : ""}`}
                aria-pressed={end}
                className={`figures text-small relative flex size-full items-center justify-center rounded-[6px] ${
                  end
                    ? "bg-ink font-semibold text-white"
                    : off
                      ? "cursor-not-allowed text-muted/40"
                      : `hover:bg-panel-2 hover:ring-1 hover:ring-edge ${n === today ? "font-semibold text-ink underline decoration-2 underline-offset-4" : "text-ink"}`
                }`}
              >
                {dayOfMonth(n)}
                {activity.has(n) && !off && (
                  <span aria-hidden className={`absolute bottom-1 size-1 rounded-full ${end ? "bg-white" : "bg-muted/70"}`} />
                )}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({ dir, disabled, onClick }: { dir: "back" | "forward"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={dir === "back" ? "Previous month" : "Next month"}
      className="flex size-7 items-center justify-center rounded-[6px] text-muted hover:bg-panel-2 hover:text-ink disabled:text-rule disabled:hover:bg-transparent"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={dir === "back" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      </svg>
    </button>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-muted"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
