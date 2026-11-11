import Link from "next/link";
import { connection } from "next/server";
import { loadCompetitors } from "@/lib/competitors";
import { loadConfig } from "@/lib/config";
import type { CompetitorEvent } from "@/lib/events";
import { earliestDay, loadOverview, readFilter, readRange, type OverviewData } from "@/lib/overview";
import type { Tasks, Templates } from "@/lib/prompt";
import { loadTasks, loadTemplates } from "@/lib/prompt-templates";
import { checkingFirstRuns, isDue, loadSavedStates, nextRun, REFRESH_EVERY_MS, showStaleWarning, type SavedStates } from "@/lib/refresh";
import { getStore } from "@/lib/store";
import type { NamedState, WatchState } from "@/lib/watch-status";
import { whatChanged } from "@/lib/what-changed";
import { KIND_NAME } from "./colors";
import { dateTime, hostOf, relative, shortDate } from "./format";
import { contextDevLink } from "@/lib/links";
import { Footer } from "./context-dev";
import { Ago } from "./ago";
import { CompanyMark } from "./mark";
import { SupportText } from "./support-text";
import { OverviewBoard, type FeedItem } from "./overview-board";
import { Refresher } from "./refresher";
import { assessData } from "./assess-data";
import { AddButton } from "./shell";
import { MonitorsStatus, type MonitorGroup } from "./monitors-status";
import { Stat, Strip, Value } from "./strip";
import { toNum } from "./time";
import type { TimelineRow } from "./timeline";

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PAD = "px-(--gutter)";

export async function Overview({ searchParams }: { searchParams: Params }) {
  await connection();
  const params = await searchParams;
  const choice = getStore();
  if (!choice.store) return <SetupStep problem="no_store" />;
  if (!process.env.CONTEXT_DEV_API_KEY) return <SetupStep problem="no_key" />;

  // Renders from the store only. The Refresher checks context.dev afterwards (free) and redraws on news.
  const now = new Date();
  const [competitors, saved] = await Promise.all([loadCompetitors(choice.store), loadSavedStates(choice.store)]);
  if (!competitors.length) return <Empty />;
  const states = new Map(Object.entries(saved?.states ?? {}));
  const data = await loadOverview(choice.store, competitors, states);
  const today = now.toISOString().slice(0, 10);
  const earliest = earliestDay(data.events, today);
  const range = readRange(one(params.from), one(params.to), today, earliest);
  const filter = readFilter(
    one(params.c),
    data.rows.map((r) => r.competitor),
  );
  return (
    <>
      <OverviewView
        data={data}
        saved={saved}
        templates={loadTemplates()}
        tasks={loadTasks()}
        now={now}
        initial={{ ...range, filter }}
        earliest={earliest}
      />
      <Refresher stale={isDue(saved, now)} fast={checkingFirstRuns(saved, now)} at={saved?.at ?? null} />
    </>
  );
}

function OverviewView({
  data,
  saved,
  templates,
  tasks,
  now,
  initial,
  earliest,
}: {
  data: OverviewData;
  saved: SavedStates | null;
  templates: Templates;
  tasks: Tasks;
  now: Date;
  initial: { from: string; to: string; filter: string[] };
  earliest: string;
}) {
  const { rows } = data;
  const newsTimes = rows
    .map((r) => r.watches.find((w) => w.kind === "news"))
    .map((w) => (w?.state === "working" ? w.lastChecked : w?.state === "not_working" ? w.since : null))
    .filter((t): t is string => Boolean(t))
    .sort();
  const retryMinutes = saved?.failedAt ? Math.max(1, Math.ceil((Date.parse(saved.failedAt) + REFRESH_EVERY_MS - now.getTime()) / 60_000)) : 0;
  const color = new Map(rows.map((r) => [r.competitor.slug, r.colorIndex]));
  const logo = new Map(rows.map((r) => [r.competitor.slug, r.competitor.logo]));
  const latest = data.events.find((e) => e.detectedAt <= now.toISOString()) ?? null;

  return (
    <>
      {showStaleWarning(saved, now) && (
        <p className={`text-body border-b border-rule bg-warn-tint ${PAD} py-2.5 text-warn`}>
          {saved?.at ? (
            <>
              Last update <Ago iso={saved.at} />.
            </>
          ) : (
            "Not updated yet."
          )}{" "}
          Next try in {retryMinutes} {retryMinutes === 1 ? "minute" : "minutes"}.
        </p>
      )}

      <Strip
        end={
          <>
            {/* The newest change of any kind, whatever range the timeline shows. */}
            {latest ? (
              <Stat title={`${latest.competitor.name}: ${latest.title}, ${shortDate(latest.detectedAt)}`}>
                Last change{" "}
                <Value>
                  <Ago iso={latest.detectedAt} />
                </Value>
              </Stat>
            ) : (
              <Stat>
                Last change <Value>none yet</Value>
              </Stat>
            )}
            <Stat title={saved?.at ? `Updated ${dateTime(saved.at)}` : undefined}>
              {saved?.at && !nextRun(saved, now) ? "Updated" : "Next check"}{" "}
              <Value>{!saved?.at ? "updating…" : nextRun(saved, now) ? <Ago iso={nextRun(saved, now)!} next /> : <Ago iso={saved.at} />}</Value>
            </Stat>
          </>
        }
      >
        <Stat>
          Competitors <Value>{rows.length}</Value>
        </Stat>
        <MonitorsStatus groups={monitorGroups(rows, now)} newsEveryDays={loadConfig().news.everyDays} />
      </Strip>

      <OverviewBoard
        rows={lanes(data)}
        items={data.events.map((e) => feedItem(e, color.get(e.competitor.slug) ?? 0, logo.get(e.competitor.slug) ?? null, templates, tasks))}
        today={now.toISOString().slice(0, 10)}
        earliest={earliest}
        initial={initial}
        status={feedStatus(data)}
        newsSearched={
          newsTimes[0] ? (
            <Stat title={dateTime(newsTimes[0])}>
              News searched{" "}
              <Value>
                <Ago iso={newsTimes[0]} />
              </Value>
            </Stat>
          ) : null
        }
      />

      {data.removed.length > 0 && (
        <section className="border-t border-rule">
          <h2 className={`text-heading ${PAD} py-4 font-semibold`}>No longer watched</h2>
          {data.removed.map((c) => (
            <div key={c.slug} className={`text-body flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule ${PAD} py-3`}>
              <CompanyMark name={c.name} logo={c.logo} size={16} />
              <Link href={`/c/${c.slug}`} className="font-semibold hover:underline">
                {c.name}
              </Link>
              <span className="text-small text-muted">{c.domain}</span>
              {c.removedAt && <span className="text-small text-muted">Removed {shortDate(c.removedAt)}. Its saved timeline is kept.</span>}
            </div>
          ))}
        </section>
      )}

      <Footer />
    </>
  );
}

/** Each competitor's monitors and news search, with one line on each for the monitors card. */
function monitorGroups(rows: OverviewData["rows"], now: Date): MonitorGroup[] {
  return rows.map((r) => ({
    slug: r.competitor.slug,
    name: r.competitor.name,
    logo: r.competitor.logo,
    colorIndex: r.colorIndex,
    watches: r.watches.map((w) => ({ kind: w.kind, label: w.label ?? KIND_NAME[w.kind], state: w.state, detail: watchDetail(w, now) })),
  }));
}

/** "Working, checked 3 hours ago", "Pricing not working: the page returns 404." */
function watchDetail(w: NamedState, now: Date): string {
  const name = w.label ?? KIND_NAME[w.kind];
  if (w.state === "working")
    return `${name}: ${w.compared === false ? "ready, first comparison within a day" : "working"}${w.lastChecked ? `, checked ${relative(w.lastChecked, now)}` : ""}`;
  if (w.state === "setting_up") return `${name}: first check running`;
  if (w.state === "unknown") return `${name}: checking status`;
  return `${name} not working: ${w.reason}.`;
}

/** One timeline lane per competitor, with what to show when it has no changes yet or a watch is broken. */
function lanes(data: OverviewData): TimelineRow[] {
  const quiet = (text: string) => <div className="text-small flex items-center px-3 text-muted">{text}</div>;
  return data.rows.map((row) => {
    const broken = row.watches.filter((w) => w.state === "not_working");
    const unknown = row.watches.some((w) => w.state === "unknown");
    const settingUp = row.watches.every((w) => w.state === "setting_up");
    return {
      slug: row.competitor.slug,
      name: row.competitor.name,
      logo: row.competitor.logo,
      colorIndex: row.colorIndex,
      empty: broken.length ? (
        <StatusLine watches={broken} />
      ) : unknown ? (
        quiet("Checking status…")
      ) : settingUp ? (
        quiet("Setting up. The first checks are running.")
      ) : null,
      below: broken.length ? <StatusLine watches={broken} className="border-t border-rule" /> : null,
    };
  });
}

/** A change as the Feed and the timeline show it, with its Assess panel data. */
function feedItem(e: CompetitorEvent, colorIndex: number, logo: string | null, templates: Templates, tasks: Tasks): FeedItem {
  const what = whatChanged(e);
  const changed = e.kind === "news" ? null : what.rows.find((r) => r.type === "changed");
  return {
    id: e.id,
    slug: e.competitor.slug,
    name: e.competitor.name,
    logo,
    colorIndex,
    kind: e.kind,
    ...(e.label ? { label: e.label } : {}),
    ...(e.page ? { page: e.page } : {}),
    title: e.title,
    url: e.url,
    day: e.detectedAt.slice(0, 10),
    n: toNum(e.detectedAt),
    line:
      changed && changed.type === "changed"
        ? { type: "changed", before: changed.before, after: changed.after }
        : e.origin === "changelog"
          ? { type: "muted", text: "From their changelog" }
          : e.kind === "news"
            ? { type: "muted", text: hostOf(e.url) }
            : { type: "text", text: what.summary },
    assess: assessData(e, colorIndex, templates, tasks),
  };
}

const FIX_TEXT: Record<string, string> = {
  edit_address: "Open the competitor to edit its address.",
  try_another_page: "Open the competitor to pick another page.",
  // The developer's account ran out (the server log says so): the user can only tell whoever runs the app.
  contact_support: "Contact support.",
  resume: "Whoever runs this copy can restart it.",
};

function StatusLine({ watches, className = "" }: { watches: NamedState[]; className?: string }) {
  return (
    <div
      className={`${className} text-small flex flex-col justify-center gap-0.5 border-l-[3px] border-l-warn-edge bg-warn-tint px-3 py-2.5 text-warn`}
    >
      {watches.map((w) =>
        w.state === "not_working" ? (
          <p key={`${w.kind}-${w.label ?? ""}`}>
            <span className="font-semibold text-ink">{w.label ?? KIND_NAME[w.kind]} is not working</span>
            {w.since ? (
              <>
                {" "}
                since <span className="figures">{shortDate(w.since)}</span>
              </>
            ) : null}
            : {w.reason}. <SupportText text={FIX_TEXT[w.fix] ?? ""} />
          </p>
        ) : null,
      )}
    </div>
  );
}

/** Why a range that includes today has no changes, in one line. Never "quiet" when checks are broken or not done. */
function feedStatus(data: OverviewData): string {
  const watches = data.rows.flatMap((r) => r.watches);
  const count = (state: WatchState["state"]) => watches.filter((w) => w.state === state).length;
  const waiting = watches.filter((w) => w.state === "working" && !w.compared).length;
  if (count("unknown") > 0) return "Checking status…";
  if (count("not_working") > 0) return `${count("not_working")} of ${data.watchesTotal} watches are not working, so changes may be missing.`;
  if (count("setting_up") > 0) return `${count("setting_up")} of ${data.watchesTotal} watches are still setting up.`;
  if (waiting > 0) return `The first comparison of ${waiting} ${waiting === 1 ? "page" : "pages"} runs within a day of adding.`;
  return "Every check worked.";
}

function Empty() {
  return (
    <section className={`flex flex-col items-center ${PAD} py-20 text-center md:py-28`}>
      <h1 className="text-display font-semibold">Start tracking your competitors</h1>
      <p className="text-body mt-3 max-w-[520px] text-copy">
        Add a competitor. Watch Competitor watches their pricing page, changelog and news, and saves every change. Assess any change with a ready
        prompt for your AI agent.
      </p>
      <div className="mt-6">
        <AddButton />
      </div>
    </section>
  );
}

function SetupStep({ problem }: { problem: "no_store" | "no_key" }) {
  return (
    <section className={`${PAD} py-20`}>
      <h1 className="text-display font-semibold">One step before you start</h1>
      {problem === "no_key" ? (
        <p className="text-body mt-3 max-w-[600px] text-copy">
          Add your context.dev API key to <code>.env</code> as <code>CONTEXT_DEV_API_KEY</code>, then restart the app. A restricted key needs Data
          APIs (use) and Monitors (manage).{" "}
          <a className="text-accent hover:underline" href={contextDevLink("setup")}>
            Get a free key at context.dev
          </a>
          .
        </p>
      ) : (
        <p className="text-body mt-3 max-w-[600px] text-copy">
          This host keeps no files between requests, so the app needs a store. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then restart.
        </p>
      )}
    </section>
  );
}
