import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { loadCompetitorPage, type CompetitorPage, type WatchRow } from "@/lib/competitor-page";
import type { CompetitorEvent, EventKind } from "@/lib/events";
import { loadConfig } from "@/lib/config";
import { PAGE_INSTRUCTIONS } from "@/lib/page-types";
import { loadTasks, loadTemplates } from "@/lib/prompt-templates";
import { checkingFirstRuns, isDue, loadSavedStates } from "@/lib/refresh";
import { isDemo } from "@/lib/links";
import { getStore } from "@/lib/store";
import { whatChanged } from "@/lib/what-changed";
import { ChangeRows } from "./changes";
import { CompetitorActions } from "./competitor-actions";
import { hostOf, relative, shortDate, shortUrl } from "./format";
import { Refresher } from "./refresher";
import { AssessButton } from "./assess";
import { assessData } from "./assess-data";
import { ScrollRow } from "./scroll-row";
import { ShowMore } from "./show-more";
import { CompanyMark } from "./mark";
import { EditAddressButton } from "./edit-address";
import { Ago } from "./ago";
import { HoverCard } from "./hover-card";
import { SettingUp, setupSteps } from "./setting-up";
import { ManageMonitorsButton, type ManagedMonitor } from "./manage-monitors";
import { STATE_COLOR, Stat, Strip, Value } from "./strip";
import { Tag } from "./tag";
import { SupportText } from "./support-text";

const PAD = "px-(--gutter)";
const OPEN_LABEL: Record<EventKind, string> = { pricing: "Open pricing page", changelog: "Open changelog", news: "Open article", page: "Open page" };

export async function CompetitorView({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { store } = getStore();
  if (!store) notFound();
  const saved = await loadSavedStates(store);
  const kind = Array.isArray(query.k) ? query.k[0] : query.k;
  const page = await loadCompetitorPage(store, slug, saved, { kind });
  if (!page) notFound();
  const templates = loadTemplates();
  const tasks = loadTasks();
  const now = new Date();
  const config = loadConfig();
  return (
    <>
      <View page={page} templates={templates} tasks={tasks} now={now} config={config} />
      <Refresher stale={isDue(saved, now)} fast={checkingFirstRuns(saved, now)} at={saved?.at ?? null} />
    </>
  );
}

function View({
  page,
  templates,
  tasks,
  now,
  config,
}: {
  page: CompetitorPage;
  templates: ReturnType<typeof loadTemplates>;
  tasks: ReturnType<typeof loadTasks>;
  now: Date;
  config: ReturnType<typeof loadConfig>;
}) {
  const { competitor: c, colorIndex } = page;
  const removed = c.status === "removed";
  const pages = page.watches.filter((w) => w.kind !== "news" && w.url).length;
  const base = `/c/${encodeURIComponent(c.slug)}`;
  // Manage monitors lists the page monitors with what each reports, the same words the Add panel showed.
  const managed: ManagedMonitor[] = page.watches.flatMap((w) =>
    w.kind === "news"
      ? []
      : [
          {
            kind: w.kind,
            label: w.label,
            url: w.url,
            ...(w.page ? { page: w.page } : {}),
            ...(w.monitorId ? { monitorId: w.monitorId } : {}),
            reports: w.kind === "page" ? PAGE_INSTRUCTIONS[w.page ?? "other"] : config.instructions[w.kind],
            settingUp: w.state?.state === "setting_up",
          },
        ],
  );

  return (
    <>
      <section className={`border-b border-rule ${PAD} pt-4 pb-5`}>
        <nav className="text-small mb-3 text-muted">
          <Link href="/" className="hover:text-ink hover:underline">
            Overview
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-copy">{c.name}</span>
        </nav>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <CompanyMark name={c.name} logo={c.logo} colorIndex={colorIndex} size={48} />
          <div className="min-w-0 flex-1 basis-60">
            <h1 className="text-display font-semibold">{c.name}</h1>
            <p className="text-body mt-1 line-clamp-2 max-w-[720px] text-copy" title={c.description ?? undefined}>
              <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-muted hover:text-ink hover:underline">
                {c.domain}
              </a>
              {c.description && <span className="ml-2">{c.description}</span>}
            </p>
            {c.focus && (
              <p className="text-small mt-2 text-muted">
                Focus: <span className="text-copy">{c.focus}</span>
              </p>
            )}
          </div>
          <div className="max-sm:w-full max-sm:pl-16">
            {!isDemo() && <CompetitorActions slug={c.slug} name={c.name} pages={pages} removed={removed} />}
          </div>
        </div>
      </section>

      {removed ? (
        <p className={`text-body border-b border-rule bg-panel ${PAD} py-3 text-copy`}>
          No longer watched since {c.removedAt ? shortDate(c.removedAt) : "it was removed"}. The timeline below is what was saved.
        </p>
      ) : (
        <Strip
          end={
            <>
              <Stat>
                Last check <Value>{page.lastChecked ? <Ago iso={page.lastChecked} /> : "not yet"}</Value>
              </Stat>
              <Stat>
                Next check <Value>{page.nextCheck ? <Ago iso={page.nextCheck} next /> : "not scheduled"}</Value>
              </Stat>
            </>
          }
        >
          <span className="flex flex-wrap items-center gap-1.5">
            {page.watches.map((w) => (
              <WatchPill key={`${w.kind}-${w.label}`} watch={w} now={now} company={c.name} newsDays={config.news.everyDays} />
            ))}
          </span>
        </Strip>
      )}
      {!removed && <BrokenWatches watches={page.watches} slug={c.slug} />}

      <div className="flex-1">
        <div className="min-w-0">
          {page.settingUp && !removed && <SetupBox page={page} />}

          {/* Phone: the chips scroll sideways in one row and the gear stays in view after them (kit rule: toolbars never wrap). */}
          <nav aria-label="Filter by type" className={`flex items-center gap-1.5 border-b border-rule ${PAD} py-3`}>
            <ScrollRow label="Filter by type" bleed={false}>
              <Chip href={base} active={!page.filter}>
                All <Count n={page.total} />
              </Chip>
              {/* One chip per tag: Features, Pricing, News, then each extra page by its own name, such as Careers. */}
              {page.filters.map((f) => (
                <Chip key={f.key} href={`${base}?k=${encodeURIComponent(f.key)}`} active={page.filter === f.key}>
                  {f.label} <Count n={f.count} />
                </Chip>
              ))}
            </ScrollRow>
            {/* The gear opens Manage monitors. On the demo it shows the list, and adding shows how to run your own copy. */}
            {!removed && (
              <ManageMonitorsButton
                slug={c.slug}
                name={c.name}
                domain={c.domain}
                monitors={managed}
                news={{ on: c.news !== false, everyDays: config.news.everyDays }}
                demo={isDemo()}
              />
            )}
          </nav>

          {page.events.length ? (
            page.events.map((e) => <EventRow key={e.id} event={e} assess={assessData(e, colorIndex, templates, tasks)} />)
          ) : (
            <Empty page={page} />
          )}

          {page.before.length > 0 && (
            <section>
              <div className={`flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-y border-rule bg-panel ${PAD} py-2.5`}>
                <span className="label">Before you added {c.name}</span>
                <span className="text-small text-muted">The 90 days before {shortDate(c.addedAt)}</span>
              </div>
              <ShowMore>
                {page.before.map((e) => (
                  <div
                    key={e.id}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b border-rule ${PAD} sm:grid-cols-[88px_64px_1fr] sm:gap-x-4 sm:gap-y-0 py-3 last:border-b-0`}
                  >
                    <span className="text-small col-start-2 row-start-1 self-center justify-self-end text-muted sm:col-auto sm:row-auto sm:self-auto sm:justify-self-auto sm:pt-0.5">
                      {shortDate(e.detectedAt)}
                    </span>
                    <span className="col-start-1 row-start-1 sm:col-auto sm:row-auto sm:pt-0.5">
                      <Tag kind={e.kind} label={e.label} page={e.page} />
                    </span>
                    <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-auto">
                      <a href={e.url} target="_blank" rel="noreferrer" className="text-body font-semibold hover:underline">
                        {e.title}
                      </a>
                      <p className="text-small mt-0.5 text-muted">{e.origin === "changelog" ? "From their changelog" : hostOf(e.url)}</p>
                    </div>
                  </div>
                ))}
              </ShowMore>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`text-body flex h-8 items-center gap-1.5 rounded-[6px] border px-3 ${
        active ? "border-ink bg-ink text-white" : "border-rule bg-white text-copy hover:border-edge hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function Count({ n }: { n: number }) {
  return <span className="figures text-small opacity-60">{n}</span>;
}

function EventRow({ event, assess }: { event: CompetitorEvent; assess: ReturnType<typeof assessData> }) {
  const { summary, rows } = whatChanged(event);
  const isNews = event.kind === "news";
  return (
    // Phone: tag and date on one line, then the change across the full width. Wider: date, tag and change in columns.
    <article
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b border-rule ${PAD} sm:grid-cols-[88px_64px_1fr] sm:gap-x-4 sm:gap-y-0 py-4`}
    >
      <span className="text-small col-start-2 row-start-1 self-center justify-self-end text-muted sm:col-auto sm:row-auto sm:self-auto sm:justify-self-auto sm:pt-0.5">
        {shortDate(event.detectedAt)}
      </span>
      <span className="col-start-1 row-start-1 sm:col-auto sm:row-auto sm:pt-0.5">
        <Tag kind={event.kind} label={event.label} page={event.page} />
      </span>
      <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-auto">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-body font-semibold">{event.title}</h3>
            <p className="text-small mt-0.5 text-muted">{isNews ? hostOf(event.url) : summary}</p>
          </div>
          <AssessButton data={assess} />
        </div>
        {rows.length > 0 && (
          <div className="mt-2.5">
            <ChangeRows rows={rows} />
          </div>
        )}
        <a href={event.url} target="_blank" rel="noreferrer" className="text-small mt-2 inline-flex items-center gap-1 text-accent hover:underline">
          {OPEN_LABEL[event.kind]}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      </div>
    </article>
  );
}

/** "their changelog", "their pricing page", "their Careers page". */
const pageName = (w: WatchRow) =>
  w.kind === "changelog" && w.label === "Changelog"
    ? "their changelog"
    : w.kind === "pricing" && w.label === "Pricing"
      ? "their pricing page"
      : `their ${w.label} page`;

/** The set-up box for this competitor: full steps while it is new (no page compared yet), else one line per first check. */
function SetupBox({ page }: { page: CompetitorPage }) {
  const isNew = !page.compared;
  const news = page.watches.find((w) => w.kind === "news")?.state ?? null;
  const steps = setupSteps({
    isNew,
    news: news && {
      state: news.state,
      noSource: news.state === "not_working" && /news source/.test(news.reason),
      support: news.state === "not_working" && news.fix === "contact_support",
    },
    history: page.historyCheck && {
      ok: page.historyCheck.ok,
      days: page.historyCheck.days,
      support: page.historyCheck.reason === "out_of_credits",
    },
    monitors: page.watches
      .filter((w) => w.kind !== "news" && w.url && w.state)
      .map((w) => ({
        name: pageName(w),
        label: w.label,
        state: w.state!.state,
        support: w.state!.state === "not_working" && w.state!.fix === "contact_support",
      })),
  });
  return <SettingUp isNew={isNew} steps={steps} pad={PAD} />;
}

function Empty({ page }: { page: CompetitorPage }) {
  const c = page.competitor;
  const chosen = page.filters.find((f) => f.key === page.filter);
  const MAIN: Record<string, string> = { changelog: "feature", pricing: "pricing", news: "news" };
  let text = !chosen
    ? `No changes since you added ${c.name}.`
    : MAIN[chosen.key]
      ? `No ${MAIN[chosen.key]} changes since you added ${c.name}.`
      : `No changes on their ${chosen.label} page since you added ${c.name}.`;
  if (!page.compared && c.status === "watching") text = "No changes yet. The first comparison runs within a day of adding.";
  return <p className={`text-body ${PAD} py-6 text-muted`}>{text}</p>;
}

const FIX: Record<string, string> = {
  edit_address: "If the page moved, give its new address.",
  try_another_page: "Try another page on their site.",
  // The developer's account ran out (the server log says so): the user can only tell whoever runs the app.
  contact_support: "Contact support.",
  resume: "Whoever runs this copy can restart it.",
};

/** One watch as a small pill: dot, name. Hover for the address and last check. Pages open their page. */
function WatchPill({ watch, now, company, newsDays }: { watch: WatchRow; now: Date; company: string; newsDays: number }) {
  const s = watch.state;
  const name = watch.label;
  const detail = !s
    ? "Not watched"
    : s.state === "working"
      ? `${s.compared ? "Working" : "Ready"} · checked ${s.lastChecked ? relative(s.lastChecked, now) : "recently"}`
      : s.state === "setting_up"
        ? "First check running"
        : s.state === "unknown"
          ? "Checking status"
          : `Not working: ${s.reason}`;
  // News is our own search, not a page: the card says what it does instead of an address.
  const where =
    watch.kind === "news"
      ? `We search the web ${newsDays === 1 ? "daily" : `every ${newsDays} days`} for news about ${company}.`
      : watch.url
        ? shortUrl(watch.url)
        : "";
  const color = s ? STATE_COLOR[s.state] : "#D5DAE1";
  const pill = (
    <span
      className={`text-small inline-flex h-6 items-center gap-1.5 rounded-full border border-rule bg-white px-2.5 ${s ? "text-ink" : "text-muted line-through decoration-rule"}`}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      {name}
      <span className="sr-only">: {detail}</span>
    </span>
  );
  // Same instant card as the timeline and the Overview's monitors pill.
  const card = (
    <div>
      <p className="text-body flex items-center gap-2 font-semibold text-ink">
        <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
        {name}
      </p>
      <p className={`text-small mt-0.5 ${s?.state === "not_working" ? "text-warn" : "text-copy"}`}>{detail}</p>
      {where && <p className="text-small mt-1.5 border-t border-rule pt-1.5 text-muted">{where}</p>}
      {watch.url && <p className="text-label mt-1 text-muted">Click to open the page.</p>}
    </div>
  );
  return (
    <HoverCard card={card} width={280}>
      {watch.url ? (
        <a href={watch.url} target="_blank" rel="noreferrer" className="rounded-full hover:[&>span]:border-edge">
          {pill}
        </a>
      ) : (
        pill
      )}
    </HoverCard>
  );
}

/** A broken watch is never hidden: one line each under the strip, with the reason and the fix. */
function BrokenWatches({ watches, slug }: { watches: WatchRow[]; slug: string }) {
  const broken = watches.filter((w) => w.state?.state === "not_working");
  if (!broken.length) return null;
  return (
    <div className={`text-small border-b border-rule border-l-[3px] border-l-warn-edge bg-warn-tint ${PAD} py-2.5 text-warn`}>
      {broken.map((w) =>
        w.state?.state === "not_working" ? (
          <p key={`${w.kind}-${w.label ?? ""}`}>
            <span className="font-semibold text-ink">{w.label} is not working</span>
            {w.state.since ? ` since ${shortDate(w.state.since)}` : ""}: {w.state.reason}. <SupportText text={FIX[w.state.fix] ?? ""} />
            {w.monitorId && (w.state.fix === "edit_address" || w.state.fix === "try_another_page") && (
              <EditAddressButton slug={slug} monitorId={w.monitorId} label={w.label} url={w.url} />
            )}
          </p>
        ) : null,
      )}
    </div>
  );
}
