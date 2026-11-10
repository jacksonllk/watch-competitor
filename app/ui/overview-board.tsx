"use client";

/**
 * The Overview below the strip: competitor chips, the range controls, the timeline and the Feed.
 * Every saved change is already in the page, so changing the range or the chips redraws at once with no request.
 * The address keeps the range and the chips (from, to, c), so a link or a reload opens the same view.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EventKind } from "@/lib/events";
import type { PageType } from "@/lib/page-types";
import { weekLabel } from "./format";
import { HoverCard } from "./hover-card";
import { CompanyMark } from "./mark";
import { RangePicker } from "./range-picker";
import { ScrollRow } from "./scroll-row";
import { Stat, Strip, Value } from "./strip";
import type { AssessData } from "./assess-data";
import { AssessButton } from "./assess";
import { Tag } from "./tag";
import { daysText, rangeText, shortDay, toDay, toNum, weekStart } from "./time";
import { Timeline, type TimelineEvent, type TimelineRow } from "./timeline";
import { useTimeView } from "./use-time-view";

/** One change as the Feed shows it. Built on the server. n: its day number. */
export type FeedItem = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  colorIndex: number;
  kind: EventKind;
  /** Extra pages: the page's name for its tag, and what kind of page it is. */
  label?: string;
  page?: PageType;
  title: string;
  url: string;
  day: string;
  n: number;
  /** The line under the title: a price change, a muted source, or the summary. */
  line: { type: "changed"; before: string; after: string } | { type: "muted"; text: string } | { type: "text"; text: string };
  assess: AssessData;
};

const ZOOMS = [7, 30, 60, 90];
const PAD = "px-(--gutter)";
const DEFAULT_SPAN = 7;

type Props = {
  rows: TimelineRow[];
  items: FeedItem[];
  today: string;
  earliest: string;
  initial: { from: string; to: string; filter: string[] };
  /** Why the range has no changes, when it includes today. */
  status: string;
  newsSearched: React.ReactNode;
};

export function OverviewBoard({ rows, items, today: todayDay, earliest: earliestDay, initial, status, newsSearched }: Props) {
  const today = toNum(todayDay);
  const earliest = toNum(earliestDay);
  const tv = useTimeView({ start: toNum(initial.from), span: toNum(initial.to) - toNum(initial.from) + 1 }, earliest, today + 1);
  const [filter, setFilter] = useState(initial.filter);

  // The range the Feed shows: whole days, following the timeline as it moves.
  const span = Math.max(1, Math.round(tv.view.span));
  const from = Math.max(earliest, Math.min(Math.round(tv.view.start), today + 1 - span));
  const to = from + span - 1;
  const settled = Math.abs(tv.view.span - span) < 0.01 && Math.abs(tv.view.start - from) < 0.01;

  const chosen = (slug: string) => !filter.length || filter.includes(slug);
  const toggle = (slug: string) => {
    const next = filter.includes(slug) ? filter.filter((s) => s !== slug) : [...filter, slug];
    setFilter(next.length === rows.length ? [] : next);
  };

  // Keep the address in step, without a request. The default view (last 7 days, everyone) has a bare address.
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(() => {
      const q = new URLSearchParams();
      if (!(to === today && span === DEFAULT_SPAN)) {
        q.set("from", toDay(from));
        q.set("to", toDay(to));
      }
      if (filter.length) q.set("c", filter.join(","));
      const url = q.size ? `/?${q}` : "/";
      if (url !== `${location.pathname}${location.search}`) window.history.replaceState(null, "", url);
    }, 150);
    return () => clearTimeout(t);
  }, [from, to, span, today, filter, settled]);

  const lanes = rows.filter((r) => chosen(r.slug));
  const laneEvents: TimelineEvent[] = useMemo(
    () =>
      items
        .filter((i) => !filter.length || filter.includes(i.slug))
        .map((i) => ({
          id: i.id,
          slug: i.slug,
          kind: i.kind,
          label: i.label,
          page: i.page,
          title: i.title,
          n: i.n,
          detail: i.line.type === "changed" ? `${i.line.before} → ${i.line.after}` : i.line.text,
        })),
    [items, filter],
  );
  const activity = useMemo(() => new Set(laneEvents.map((e) => e.n)), [laneEvents]);
  const shown = useMemo(
    () => items.filter((i) => (!filter.length || filter.includes(i.slug)) && i.n >= from && i.n <= to),
    [items, filter, from, to],
  );
  const groups = useMemo(() => byWeek(shown), [shown]);

  const zoom = (days: number) => {
    // Zooming keeps the last day in place, so the days you were looking at stay on screen.
    const end = to + 1;
    tv.animateTo({ start: Math.max(earliest, end - days), span: days }, 320);
  };

  return (
    <>
      {/* One row on wide screens. On narrow ones: the chips in a row that scrolls sideways, then the range controls across the width. */}
      <div className={`flex flex-col gap-2.5 border-b border-rule ${PAD} py-3 lg:flex-row lg:items-center lg:gap-6`}>
        {rows.length > 1 && (
          <ScrollRow label="Filter by competitor">
            <button
              type="button"
              aria-pressed={!filter.length}
              onClick={() => setFilter([])}
              className={`text-body flex h-8 shrink-0 items-center rounded-[6px] border px-3 transition-colors ${
                !filter.length ? "border-ink bg-ink font-semibold text-white" : "border-rule bg-white text-copy hover:border-edge hover:text-ink"
              }`}
            >
              All
            </button>
            {rows.map((r) => (
              <LogoChip
                key={r.slug}
                row={r}
                selected={filter.includes(r.slug)}
                dimmed={filter.length > 0 && !filter.includes(r.slug)}
                onClick={() => toggle(r.slug)}
              />
            ))}
          </ScrollRow>
        )}
        <div className="flex items-center gap-2 sm:justify-between lg:ml-auto lg:shrink-0 lg:justify-start">
          <RangePicker
            className="min-w-0 flex-1 sm:flex-none"
            from={from}
            to={to}
            today={today}
            earliest={earliest}
            activity={activity}
            custom={!ZOOMS.includes(span)}
            onPick={(a, b) => tv.animateTo({ start: a, span: b - a + 1 }, 360)}
          />
          <div role="group" aria-label="Days shown" className="flex shrink-0 items-center rounded-[6px] border border-rule bg-white p-0.5">
            {ZOOMS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={span === d}
                aria-label={`${d} days`}
                onClick={() => zoom(d)}
                className={`figures text-small flex h-7 items-center rounded-[5px] px-2 transition-colors sm:px-2.5 ${
                  span === d ? "bg-ink font-semibold text-white" : "text-copy hover:bg-panel-2 hover:text-ink"
                }`}
              >
                <span className="sm:hidden">{d}d</span>
                <span className="hidden sm:inline">{d} days</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {lanes.length > 0 && <Timeline tv={tv} today={today} rows={lanes} events={laneEvents} />}

      <section>
        <Strip end={newsSearched}>
          <h2 className="text-heading font-semibold text-ink">Feed</h2>
          <Stat>
            Changes <Value>{shown.length}</Value>
          </Stat>
          <Stat>
            In <Value>{span === 1 ? rangeText(from, to, today) : `${daysText(span)}, ${rangeText(from, to, today)}`}</Value>
          </Stat>
        </Strip>
        {/* One grid for every row, so each column is as wide as its widest value and rows still line up. */}
        <div className="md:grid md:grid-cols-[max-content_max-content_max-content_minmax(0,1fr)_auto]">
          {groups.length === 0 ? (
            <WeekBar label={rangeText(from, to, today)} count={0} status={to === today ? status : ""} />
          ) : (
            groups.map((g) => (
              <div key={g.start} className="md:contents">
                <WeekBar label={g.start === weekStart(today) ? "This week" : weekLabel(toDay(g.start))} count={g.items.length} />
                {g.items.map((i) => (
                  <FeedRow key={i.id} item={i} today={today} />
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

/**
 * A competitor filter as its logo alone, so the row fits many. Hover shows the name at once.
 * Selected: the history window's outline and tint. When some are selected, the others fade.
 */
function LogoChip({ row, selected, dimmed, onClick }: { row: TimelineRow; selected: boolean; dimmed: boolean; onClick: () => void }) {
  return (
    <HoverCard card={row.name} compact>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={row.name}
        onClick={onClick}
        className={`flex size-8 shrink-0 items-center justify-center rounded-[6px] border bg-white transition-[border-color,box-shadow,opacity] ${
          selected ? "border-[1.5px] border-ink/70 bg-ink/[0.04]" : "border-rule hover:border-edge"
        } ${dimmed ? "opacity-45 hover:opacity-100" : ""}`}
      >
        <CompanyMark name={row.name} logo={row.logo} colorIndex={row.colorIndex} size={20} />
      </button>
    </HoverCard>
  );
}

/** The separator above each week in the Feed: its name, how many changes, and why it is empty when it is. */
function WeekBar({ label, count, status = "" }: { label: string; count: number; status?: string }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-rule bg-panel ${PAD} py-2 md:col-span-full`}>
      <span className="label">{label}</span>
      <span className="text-small text-muted">
        {count ? (
          <>
            <span className="figures">{count}</span> {count === 1 ? "change" : "changes"}
          </>
        ) : (
          "No changes"
        )}
      </span>
      {status && <span className="text-small text-muted">· {status}</span>}
    </div>
  );
}

/**
 * One change. Desktop: date, company, tag, title, Assess in the Feed's shared columns.
 * Phone: two columns, so no line holds one small thing: company and tag with the date on the right,
 * then the title and its line with Assess at the bottom right.
 */
function FeedRow({ item, today }: { item: FeedItem; today: number }) {
  return (
    <article
      id={`event-${item.id}`}
      className={`grid scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-b border-rule ${PAD} py-3 transition-colors hover:bg-panel md:col-span-full md:grid-cols-subgrid md:gap-x-4 md:gap-y-1.5`}
    >
      <span className="figures text-small col-start-2 row-start-1 self-center justify-self-end text-muted md:col-auto md:row-auto md:self-auto md:justify-self-auto md:pt-0.5">
        {shortDay(item.n, today)}
      </span>
      <span className="text-body col-start-1 row-start-1 flex min-w-0 items-center gap-2 md:col-auto md:row-auto">
        <CompanyMark name={item.name} logo={item.logo} colorIndex={item.colorIndex} size={16} />
        <Link href={`/c/${item.slug}`} className="max-w-[180px] truncate hover:underline">
          {item.name}
        </Link>
        <span className="md:hidden">
          <Tag kind={item.kind} label={item.label} page={item.page} />
        </span>
      </span>
      <span className="hidden md:block md:pt-0.5">
        <Tag kind={item.kind} label={item.label} page={item.page} />
      </span>
      <div className="col-start-1 row-start-2 min-w-0 md:col-auto md:row-auto">
        <a href={item.url} className="text-body font-semibold hover:underline" rel="noreferrer" target="_blank">
          {item.title}
        </a>
        {item.line.type === "changed" ? (
          <p className="text-body mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-muted">{item.line.before}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
              className="text-muted"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
            <span className="font-semibold">{item.line.after}</span>
          </p>
        ) : item.line.type === "muted" ? (
          <p className="text-small mt-0.5 text-muted">{item.line.text}</p>
        ) : (
          <p className="text-body mt-0.5 text-copy">{item.line.text}</p>
        )}
      </div>
      <div className="col-start-2 row-start-2 self-end md:col-auto md:row-auto md:self-auto md:pt-0.5">
        <AssessButton data={item.assess} />
      </div>
    </article>
  );
}

/** Items grouped by week (Sunday to Saturday), newest week first. Items arrive newest first. */
function byWeek(items: FeedItem[]): { start: number; items: FeedItem[] }[] {
  const groups: { start: number; items: FeedItem[] }[] = [];
  for (const i of items) {
    const start = weekStart(i.n);
    const last = groups.at(-1);
    if (last?.start === start) last.items.push(i);
    else groups.push({ start, items: [i] });
  }
  return groups;
}
