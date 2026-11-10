"use client";

/**
 * The Overview timeline: one lane per competitor on a continuous day axis, the layout of Gantt and event timelines
 * (Linear's timeline, Datadog's event overlay). Every change is a dot on its exact day, coloured by type.
 * Hovering or focusing a dot shows what happened at once. Clicking it scrolls to that change in the Feed.
 * Drag the lanes (or swipe on a trackpad) to move through time, pinch to zoom. The history bar under the lanes
 * shows every saved day: drag its window to move, pull an edge to change the range, click to jump.
 */
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TAG } from "./colors";
import { FloatingCard } from "./hover-card";
import { CompanyMark } from "./mark";
import { Tag, TYPE_COLOR } from "./tag";
import { dayOfMonth, longDay, MONTHS, monthOf, rangeText, WEEKDAYS, weekday, yearOf } from "./time";
import type { TimeView } from "./use-time-view";

type Kind = keyof typeof TAG;

/** n: the day number (see time.ts). */
export type TimelineEvent = { id: string; slug: string; kind: Kind; title: string; n: number; detail: string };
export type TimelineRow = {
  slug: string;
  name: string;
  logo: string | null;
  colorIndex: number;
  /** Shown instead of dots when the competitor has no saved changes at all (setting up, checking, broken). */
  empty: ReactNode;
  /** Shown under the dots when something is broken. */
  below: ReactNode;
};

const ORDER: Kind[] = ["pricing", "changelog", "news"];
const GRID = "grid grid-cols-[44px_1fr] sm:grid-cols-[minmax(112px,180px)_1fr]";
/** Below this many pixels per day, nearby days share one marker. */
const MIN_GAP = 12;

type Scale = "day" | "dense" | "week" | "month";
const scaleOf = (ppd: number): Scale => (ppd >= 72 ? "day" : ppd >= 20 ? "dense" : ppd >= 5 ? "week" : "month");

type Open = { key: string; rect: DOMRect; name: string; events: TimelineEvent[]; touch: boolean };

export function Timeline({ tv, today, rows, events }: { tv: TimeView; today: number; rows: TimelineRow[]; events: TimelineEvent[] }) {
  const { start, span } = tv.view;
  const axis = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState<Open | null>(null);
  const touch = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = axis.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // A fixed popover would drift on scroll, so scrolling or resizing closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Trackpad: a sideways swipe moves through time, a pinch (ctrl + wheel) zooms around the pointer. Vertical scrolling stays the page's.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const box = axis.current?.getBoundingClientRect();
      if (!box?.width) return;
      const v = tv.current();
      if (e.ctrlKey) {
        e.preventDefault();
        const f = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
        const next = Math.min(Math.max(v.span * Math.exp(e.deltaY * 0.01), 1), tv.bounds.max - tv.bounds.min);
        tv.set({ start: v.start + f * (v.span - next), span: next });
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        tv.set({ start: v.start + (e.deltaX / box.width) * v.span, span: v.span });
      } else return;
      setOpen(null);
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => tv.animateTo(tv.current(), 200), 160);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tv]);

  /** Drag on the lanes or the axis. Starts after 4px, so a click on a dot stays a click. A quick flick keeps gliding. */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !(e.target as HTMLElement).closest("[data-track]")) return;
    touch.current = e.pointerType === "touch";
    const box = axis.current?.getBoundingClientRect();
    if (!box?.width) return;
    const v0 = tv.current();
    const perDay = box.width / v0.span;
    const x0 = e.clientX;
    let moved = false;
    const samples: { t: number; x: number }[] = [{ t: performance.now(), x: x0 }];
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) {
        moved = true;
        setOpen(null);
        document.documentElement.classList.add("ui-grabbing");
      }
      samples.push({ t: performance.now(), x: ev.clientX });
      if (samples.length > 6) samples.shift();
      tv.set({ start: v0.start - dx / perDay, span: v0.span }, true);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!moved) return;
      document.documentElement.classList.remove("ui-grabbing");
      // The click that ends a drag is not a click on a dot.
      const swallow = (c: Event) => c.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      const first = samples[0];
      const last = samples.at(-1)!;
      const dt = Math.max(1, last.t - first.t);
      const recent = ev.type === "pointerup" && performance.now() - last.t < 80;
      const glide = recent ? (-(last.x - first.x) / dt / perDay) * 220 : 0;
      const v = tv.current();
      tv.animateTo({ start: v.start + Math.max(-v.span, Math.min(v.span, glide)), span: v.span }, Math.abs(glide) > 0.5 ? 480 : 240);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = tv.current();
    const step = e.shiftKey ? v.span : Math.max(1, Math.round(v.span / 7));
    const zoom = (factor: number) => {
      const next = Math.round(Math.min(Math.max(v.span * factor, 1), tv.bounds.max - tv.bounds.min));
      tv.animateTo({ start: v.start + v.span - next, span: next });
    };
    if (e.key === "ArrowLeft") tv.animateTo({ start: v.start - step, span: v.span });
    else if (e.key === "ArrowRight") tv.animateTo({ start: v.start + step, span: v.span });
    else if (e.key === "-" || e.key === "_") zoom(1.5);
    else if (e.key === "=" || e.key === "+") zoom(1 / 1.5);
    else return;
    e.preventDefault();
    setOpen(null);
  };

  const jump = (list: TimelineEvent[]) => {
    const row = document.getElementById(`event-${list[0].id}`);
    if (!row) return;
    setOpen(null);
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.remove("ui-flash");
    void row.offsetWidth;
    row.classList.add("ui-flash");
  };

  const perDay = width ? width / span : 30;
  const scale = scaleOf(perDay);
  const k = perDay >= MIN_GAP ? 1 : Math.ceil(MIN_GAP / perDay);
  const words = scale === "day" && k === 1;
  const x = (n: number) => `${((n - start) / span) * 100}%`;
  const first = Math.floor(start) - 1;
  const last = Math.ceil(start + span) + 1;

  return (
    <section ref={section} aria-label="Timeline" className="relative border-b border-rule select-none" onPointerDown={onPointerDown}>
      <div className={`${GRID} border-b border-rule`}>
        <div />
        <div className="relative">
          <div ref={axis} data-track className="relative h-11 cursor-grab touch-pan-y overflow-hidden">
            {today >= first && today <= last && <span className="absolute bottom-0 h-0.5 bg-ink" style={{ left: x(today), width: `${100 / span}%` }} />}
            <Axis start={start} span={span} perDay={perDay} scale={scale} today={today} />
          </div>
          {/* Once today is off screen, a pill at the right end of the axis brings it back. It floats, so nothing around it moves. */}
          {Math.round(start + span) < today + 1 && (
            <button
              type="button"
              onClick={() => tv.animateTo({ start: today + 1 - Math.round(span), span: Math.round(span) }, 420)}
              className="ui-fade-in text-small absolute top-1/2 right-2 z-20 flex h-7 -translate-y-1/2 items-center gap-1 rounded-full border border-rule bg-white pr-2 pl-2.5 font-semibold text-ink shadow-[0_1px_3px_rgba(16,24,40,0.1)] hover:border-edge"
            >
              Today
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        tabIndex={0}
        aria-label="Timeline lanes. Drag, or use the left and right arrow keys, to move through time. Plus and minus zoom."
        onKeyDown={onKeyDown}
        className="outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(27,36,48,0.25)]"
      >
        {rows.map((row) => {
          const mine = events.filter((e) => e.slug === row.slug);
          const groups = new Map<number, TimelineEvent[]>();
          for (const e of mine) {
            if (e.n < first - k || e.n > last + k) continue;
            const b = Math.floor(e.n / k);
            groups.set(b, [...(groups.get(b) ?? []), e]);
          }
          return (
            <div key={row.slug} className="group border-b border-rule last:border-b-0">
              <div className={GRID}>
                <div className="text-body flex min-h-12 min-w-0 items-center bg-page py-2.5 pl-(--gutter) font-semibold transition-colors group-hover:bg-panel sm:pr-3">
                  <Link href={`/c/${row.slug}`} className="flex min-w-0 items-center gap-2.5 hover:underline" aria-label={row.name}>
                    <CompanyMark name={row.name} logo={row.logo} colorIndex={row.colorIndex} size={20} />
                    <span className="hidden truncate sm:inline">{row.name}</span>
                  </Link>
                </div>
                {mine.length === 0 && row.empty ? (
                  <div className="grid">{row.empty}</div>
                ) : (
                  <div data-track className="relative min-h-12 cursor-grab touch-pan-y overflow-hidden transition-colors group-hover:bg-panel">
                    <Gridlines start={start} span={span} scale={scale} today={today} />
                    {[...groups.entries()].map(([b, list]) => {
                      list.sort((a, c) => ORDER.indexOf(a.kind) - ORDER.indexOf(c.kind) || c.n - a.n);
                      const center = list.reduce((sum, e) => sum + e.n, 0) / list.length + 0.5;
                      const key = `${row.slug}:${k}:${b}`;
                      const days = [...new Set(list.map((e) => e.n))];
                      const when = days.length === 1 ? longDay(days[0]) : rangeText(Math.min(...days), Math.max(...days), today);
                      const show = (el: HTMLElement) => {
                        if (!document.documentElement.classList.contains("ui-grabbing"))
                          setOpen({ key, rect: el.getBoundingClientRect(), name: row.name, events: list, touch: touch.current });
                      };
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-label={`${when}: ${list.map((e) => `${TAG[e.kind]}, ${e.title}`).join("; ")}`}
                          className="absolute inset-y-0 z-10 flex -translate-x-1/2 cursor-pointer flex-col items-center justify-center gap-[3px] outline-none"
                          style={{ left: x(center), minWidth: words ? undefined : 16 }}
                          onPointerDown={(e) => (touch.current = e.pointerType === "touch")}
                          onMouseEnter={(e) => show(e.currentTarget)}
                          onMouseLeave={() => setOpen(null)}
                          onFocus={(e) => show(e.currentTarget)}
                          onBlur={() => setOpen(null)}
                          onClick={(e) => {
                            // On a phone the first tap shows what happened. The next tap goes to the Feed.
                            if (touch.current && open?.key !== key) return show(e.currentTarget);
                            jump(list);
                          }}
                        >
                          <Markers list={list} words={words} active={open?.key === key} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {mine.length > 0 && row.below && (
                <div className={GRID}>
                  <div />
                  {row.below}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <HistoryBar tv={tv} today={today} events={events} />
      {open && <Popover open={open} today={today} />}
    </section>
  );
}

/** Day labels. Wide days: "Mon 19". Then months above with every day, every Sunday, or none below. Today in bold ink. */
function Axis({ start, span, perDay, scale, today }: { start: number; span: number; perDay: number; scale: Scale; today: number }) {
  const x = (n: number) => `${((n - start) / span) * 100}%`;
  const first = Math.floor(start) - 1;
  const last = Math.ceil(start + span) + 1;
  const days = Array.from({ length: last - first }, (_, i) => first + i);
  const year = yearOf(today);
  const monthName = (n: number) => `${MONTHS[monthOf(n)]}${monthOf(n) === 0 || yearOf(n) !== year ? ` ${yearOf(n)}` : ""}`;

  if (scale === "day") {
    return days.map((n) => (
      <span
        key={n}
        className={`figures text-small absolute inset-y-0 flex items-center border-l border-rule px-3 whitespace-nowrap ${n === today ? "font-semibold text-ink" : "text-muted"}`}
        style={{ left: x(n), width: `${100 / span}%` }}
      >
        {WEEKDAYS[weekday(n)]} {dayOfMonth(n)}
        {n === today && <span className="sr-only"> (today)</span>}
      </span>
    ));
  }

  const monthStarts = days.filter((n) => dayOfMonth(n) === 1);
  // The month at the left edge stays labelled until the next month's label reaches it.
  const nextStart = monthStarts.find((n) => n > start);
  const stickyMonth = nextStart === undefined || (nextStart - start) * perDay > 52;
  const numbers =
    scale === "dense" ? days : days.filter((n) => n === today || (scale === "week" && weekday(n) === 0 && (n > today || n < today - 2)));
  return (
    <>
      {stickyMonth && (
        <span className="text-small absolute top-1.5 left-0 pl-1.5 font-semibold whitespace-nowrap text-ink">{monthName(Math.floor(start))}</span>
      )}
      {monthStarts.map((n) => (
        <span key={`m${n}`}>
          <span className="absolute inset-y-0 w-px bg-edge" style={{ left: x(n) }} />
          {n > start && (
            <span className="text-small absolute top-1.5 pl-1.5 font-semibold whitespace-nowrap text-ink" style={{ left: x(n) }}>
              {monthName(n)}
            </span>
          )}
        </span>
      ))}
      {numbers.map((n) => {
        const centered = n === today || scale === "dense";
        return (
          <span
            key={n}
            className={`figures text-label absolute bottom-1.5 whitespace-nowrap ${centered ? "-translate-x-1/2" : "pl-1.5"} ${
              n === today ? "font-semibold text-ink" : weekday(n) % 6 === 0 && scale === "dense" ? "text-muted/60" : "text-muted"
            }`}
            style={{ left: centered ? x(n + 0.5) : x(n) }}
          >
            {dayOfMonth(n)}
            {n === today && <span className="sr-only"> (today)</span>}
          </span>
        );
      })}
    </>
  );
}

/** Day lines when days are wide. Weekend shading and week lines when days are numbered. Week lines, then month lines only, further out. */
function Gridlines({ start, span, scale, today }: { start: number; span: number; scale: Scale; today: number }) {
  const x = (n: number) => `${((n - start) / span) * 100}%`;
  const w = `${100 / span}%`;
  const first = Math.floor(start);
  const last = Math.ceil(start + span);
  const out: ReactNode[] = [];
  if (today >= first - 1 && today <= last)
    out.push(<span key="today" className="absolute inset-y-0 bg-ink/[0.045]" style={{ left: x(today), width: w }} />);
  for (let n = first; n <= last; n++) {
    const monthLine = dayOfMonth(n) === 1;
    // A week line within 2 days of a month line would draw a double line, so the month line stands alone.
    const nearMonth = [-2, -1, 1, 2].some((d) => dayOfMonth(n + d) === 1);
    const weekLine = weekday(n) === 0 && !nearMonth && scale !== "month";
    if (scale === "dense" && weekday(n) % 6 === 0)
      out.push(<span key={`w${n}`} className="absolute inset-y-0 bg-ink/[0.025]" style={{ left: x(n), width: w }} />);
    const line = monthLine ? "bg-edge" : scale === "day" || weekLine ? "bg-rule" : null;
    if (line) out.push(<span key={`l${n}`} className={`absolute inset-y-0 w-px ${line}`} style={{ left: x(n) }} />);
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {out}
    </div>
  );
}

/** One day's changes: type words when days are wide, dots otherwise. More than 3 shows 2 and a count. */
function Markers({ list, words, active }: { list: TimelineEvent[]; words: boolean; active: boolean }) {
  const shown = list.length > 3 ? list.slice(0, 2) : list;
  const more = list.length > 3 && <span className="figures text-label leading-none font-semibold text-ink">+{list.length - 2}</span>;
  if (words) {
    return (
      <>
        {shown.map((e) => (
          <span key={e.id} className={`rounded-[5px] transition-shadow ${active ? "ring-2 ring-ink/15" : ""}`}>
            <Tag kind={e.kind} />
          </span>
        ))}
        {more}
      </>
    );
  }
  return (
    <>
      {shown.map((e) => (
        <span
          key={e.id}
          className="size-2.5 rounded-full transition-transform"
          style={{
            background: TYPE_COLOR[e.kind].fg,
            boxShadow: active ? `0 0 0 2px #fff, 0 0 0 3.5px ${TYPE_COLOR[e.kind].fg}` : "0 0 0 2px #fff",
            transform: active ? "scale(1.15)" : undefined,
          }}
        />
      ))}
      {more}
    </>
  );
}

/**
 * Every saved day in one bar, with a window over the days the timeline shows. Drag the window to move,
 * pull an edge to change the range, click outside it to jump there. The Feed follows.
 */
function HistoryBar({ tv, today, events }: { tv: TimeView; today: number; events: TimelineEvent[] }) {
  const bar = useRef<HTMLDivElement>(null);
  const { min, max } = tv.bounds;
  const total = max - min;
  const { start, span } = tv.view;
  const x = (n: number) => `${((n - min) / total) * 100}%`;
  const counts = new Map<number, number>();
  for (const e of events) counts.set(e.n, (counts.get(e.n) ?? 0) + 1);
  const most = Math.max(1, ...counts.values());
  const months = Array.from({ length: total }, (_, i) => min + i).filter((n) => dayOfMonth(n) === 1);

  const drag = (mode: "move" | "left" | "right") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const box = bar.current?.getBoundingClientRect();
    if (!box?.width) return;
    const v0 = tv.current();
    const end0 = v0.start + v0.span;
    const perDay = box.width / total;
    const x0 = e.clientX;
    document.documentElement.classList.add(mode === "move" ? "ui-grabbing" : "ui-resizing");
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0) / perDay;
      if (mode === "move") tv.set({ start: v0.start + d, span: v0.span });
      else if (mode === "left") {
        const s = Math.min(Math.max(v0.start + d, min), end0 - 1);
        tv.set({ start: s, span: end0 - s });
      } else {
        const end = Math.max(Math.min(end0 + d, max), v0.start + 1);
        tv.set({ start: v0.start, span: end - v0.start });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("ui-grabbing", "ui-resizing");
      tv.animateTo(tv.current(), 180);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const jumpTo = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const box = bar.current?.getBoundingClientRect();
    if (!box?.width) return;
    const n = min + ((e.clientX - box.left) / box.width) * total;
    const v = tv.current();
    tv.animateTo({ start: n - v.span / 2, span: v.span }, 320);
  };

  const from = Math.round(start);
  return (
    <div className={`${GRID} border-t border-rule bg-panel`}>
      <div className="flex items-center pl-(--gutter)">
        <span className="label hidden sm:inline">History</span>
      </div>
      <div className="py-2 pr-(--gutter)">
        <div ref={bar} onPointerDown={jumpTo} className="relative h-10 cursor-pointer touch-none rounded-[6px] border border-rule bg-white">
          {months.map((n) => (
            <span key={n} aria-hidden>
              <span className="absolute inset-y-0 w-px bg-rule" style={{ left: x(n) }} />
              <span className="text-label absolute top-0.5 pl-1 text-muted" style={{ left: x(n) }}>
                {MONTHS[monthOf(n)]}
              </span>
            </span>
          ))}
          {[...counts.entries()].map(([n, c]) => (
            <span
              key={n}
              aria-hidden
              className={`absolute bottom-1 rounded-t-[2px] ${n >= from && n < from + Math.round(span) ? "bg-ink/60" : "bg-muted/30"}`}
              style={{ left: x(n), width: `max(3px, calc(${100 / total}% - 1px))`, height: 6 + Math.round((c / most) * 12) }}
            />
          ))}
          <div
            role="group"
            aria-label={`Showing ${rangeText(from, from + Math.round(span) - 1, today)}`}
            onPointerDown={drag("move")}
            className="absolute inset-y-[-1px] cursor-grab rounded-[6px] border-[1.5px] border-ink/70 bg-ink/[0.04] shadow-[0_1px_2px_rgba(16,24,40,0.08)]"
            style={{ left: x(start), width: `${(span / total) * 100}%` }}
          >
            <Handle side="left" onPointerDown={drag("left")} />
            <Handle side="right" onPointerDown={drag("right")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Handle({ side, onPointerDown }: { side: "left" | "right"; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      aria-hidden
      className={`absolute inset-y-0 z-10 flex w-3 cursor-ew-resize items-center justify-center ${side === "left" ? "-left-1.5" : "-right-1.5"}`}
    >
      <span className="h-4 w-1 rounded-full border border-ink/70 bg-white" />
    </span>
  );
}

/** What happened, above the marker (below when there is no room). Shows at once, no delay. */
function Popover({ open, today }: { open: Open; today: number }) {
  const days = [...new Set(open.events.map((e) => e.n))].sort((a, b) => a - b);
  const several = days.length > 1;
  const list = several ? [...open.events].sort((a, b) => b.n - a.n) : open.events;
  return (
    <FloatingCard rect={open.rect} width={320}>
      <p className="text-small text-muted">
        <span className="font-semibold text-ink">{several ? rangeText(days[0], days.at(-1)!, today) : longDay(days[0])}</span> · {open.name}
      </p>
      <ul className="mt-2 flex flex-col gap-2.5">
        {list.slice(0, 5).map((e) => (
          <li key={e.id} className="flex items-start gap-2.5">
            <span className="pt-px">
              <Tag kind={e.kind} />
            </span>
            <span className="min-w-0">
              {several && <span className="figures text-label block text-muted">{longDay(e.n)}</span>}
              <span className="text-body line-clamp-2 font-semibold text-ink">{e.title}</span>
              {e.detail && <span className="text-small mt-0.5 line-clamp-2 text-muted">{e.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {list.length > 5 && <p className="text-small mt-2 text-muted">And {list.length - 5} more.</p>}
      <p className="text-label mt-2.5 border-t border-rule pt-2 text-muted">
        {open.touch ? "Tap again" : "Click"} to see {list.length === 1 ? "it" : "them"} in the Feed.
      </p>
    </FloatingCard>
  );
}
