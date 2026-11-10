import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { loadCompetitorPage, type CompetitorPage, type WatchRow } from "@/lib/competitor-page";
import type { CompetitorEvent, EventKind } from "@/lib/events";
import { loadTasks, loadTemplates } from "@/lib/prompt-templates";
import { isDue, loadSavedStates } from "@/lib/refresh";
import { isDemo } from "@/lib/links";
import { getStore } from "@/lib/store";
import { whatChanged } from "@/lib/what-changed";
import { ChangeRows } from "./changes";
import { KIND_NAME } from "./colors";
import { CompetitorActions } from "./competitor-actions";
import { hostOf, relative, shortDate, shortUrl } from "./format";
import { Refresher } from "./refresher";
import { AssessButton } from "./assess";
import { assessData } from "./assess-data";
import { ShowMore } from "./show-more";
import { CompanyMark } from "./mark";
import { HoverCard } from "./hover-card";
import { STATE_COLOR, Stat, Strip, Value } from "./strip";
import { Tag } from "./tag";

const PAD = "px-(--gutter)";
const CHIP: Record<EventKind, string> = { changelog: "Features", pricing: "Pricing", news: "News" };
const OPEN_LABEL: Record<EventKind, string> = { pricing: "Open pricing page", changelog: "Open changelog", news: "Open article" };

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
  return (
    <>
      <View page={page} templates={templates} tasks={tasks} now={now} />
      <Refresher stale={isDue(saved, now)} />
    </>
  );
}

function View({
  page,
  templates,
  tasks,
  now,
}: {
  page: CompetitorPage;
  templates: ReturnType<typeof loadTemplates>;
  tasks: ReturnType<typeof loadTasks>;
  now: Date;
}) {
  const { competitor: c, colorIndex } = page;
  const removed = c.status === "removed";
  const pages = page.watches.filter((w) => w.kind !== "news" && w.url).length;
  const base = `/c/${encodeURIComponent(c.slug)}`;

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
                Last check <Value>{page.lastChecked ? relative(page.lastChecked, now) : "not yet"}</Value>
              </Stat>
              <Stat>
                Next check <Value>{page.nextCheck ? relative(page.nextCheck, now) : "not scheduled"}</Value>
              </Stat>
            </>
          }
        >
          <span className="flex flex-wrap items-center gap-1.5">
            {page.watches.map((w) => (
              <WatchPill key={w.kind} watch={w} domain={c.domain} now={now} />
            ))}
          </span>
        </Strip>
      )}
      {!removed && <BrokenWatches watches={page.watches} />}

      <div className="flex-1">
        <div className="min-w-0">
          {page.settingUp && !removed && <SettingUp page={page} />}

          <nav aria-label="Filter by type" className={`flex flex-wrap items-center gap-1.5 border-b border-rule ${PAD} py-3`}>
            <Chip href={base} active={!page.kind}>
              All <Count n={page.counts.all} />
            </Chip>
            {(["changelog", "pricing", "news"] as const).map((k) => (
              <Chip key={k} href={`${base}?k=${k}`} active={page.kind === k}>
                {CHIP[k]} <Count n={page.counts[k]} />
              </Chip>
            ))}
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
                  <div key={e.id} className={`grid grid-cols-[88px_64px_1fr] gap-x-4 border-b border-rule ${PAD} py-3 last:border-b-0`}>
                    <span className="text-small pt-0.5 text-muted">{shortDate(e.detectedAt)}</span>
                    <span className="pt-0.5">
                      <Tag kind={e.kind} />
                    </span>
                    <div className="min-w-0">
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
    <article className={`grid grid-cols-[88px_64px_1fr] items-start gap-x-4 border-b border-rule ${PAD} py-4 max-sm:grid-cols-[64px_1fr]`}>
      <span className="text-small pt-0.5 text-muted max-sm:hidden">{shortDate(event.detectedAt)}</span>
      <span className="pt-0.5">
        <Tag kind={event.kind} />
      </span>
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-body font-semibold">{event.title}</h3>
            <p className="text-small mt-0.5 text-muted">
              <span className="sm:hidden">{shortDate(event.detectedAt)} · </span>
              {isNews ? hostOf(event.url) : summary}
            </p>
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

function SettingUp({ page }: { page: CompetitorPage }) {
  const news = page.watches.find((w) => w.kind === "news")?.state;
  const step = (done: boolean | "running", text: string) => (
    <li className="text-body flex items-center gap-2.5">
      {done === "running" ? (
        <span className="ui-spinner text-accent" />
      ) : done ? (
        <Check />
      ) : (
        <span className="size-3.5 rounded-full border border-edge" />
      )}
      {text}
    </li>
  );
  return (
    <section className={`border-b border-rule ${PAD} py-4`}>
      <div className="rounded-[8px] border border-dashed border-edge p-4">
        <h2 className="text-body font-semibold">Getting set up</h2>
        <p className="text-small mt-0.5 text-muted">The first check saves a copy of each page. Changes show from the next check.</p>
        <ul className="mt-3 space-y-2">
          {step(true, "Company details")}
          {step(true, news?.state === "not_working" ? "News: no news source covers this company yet" : "News, last 90 days")}
          {step("running", "Running the first checks")}
        </ul>
      </div>
    </section>
  );
}

function Empty({ page }: { page: CompetitorPage }) {
  const c = page.competitor;
  let text = page.kind ? `No ${CHIP[page.kind].toLowerCase()} changes since you added ${c.name}.` : `No changes since you added ${c.name}.`;
  if (!page.compared && c.status === "watching") text = "No changes yet. The first comparison runs within a day of adding.";
  return <p className={`text-body ${PAD} py-6 text-muted`}>{text}</p>;
}

const FIX: Record<string, string> = {
  edit_address: "Check that the address still opens.",
  try_another_page: "Try another page.",
  wait_for_refill: "Checks resume when your credits refill.",
  resume: "Fix the cause, then resume the monitor in context.dev.",
};

/** One watch as a small pill: dot, name. Hover for the address and last check. Pages open their page. */
function WatchPill({ watch, domain, now }: { watch: WatchRow; domain: string; now: Date }) {
  const s = watch.state;
  const name = KIND_NAME[watch.kind];
  const detail = !s
    ? "Not watched"
    : s.state === "working"
      ? `${s.compared ? "Working" : "Ready"} · checked ${s.lastChecked ? relative(s.lastChecked, now) : "recently"}`
      : s.state === "setting_up"
        ? "First check running"
        : s.state === "unknown"
          ? "Checking status"
          : `Not working: ${s.reason}`;
  const where = watch.kind === "news" ? `${domain} · daily` : watch.url ? shortUrl(watch.url) : "";
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
function BrokenWatches({ watches }: { watches: WatchRow[] }) {
  const broken = watches.filter((w) => w.state?.state === "not_working");
  if (!broken.length) return null;
  return (
    <div className={`text-small border-b border-rule border-l-[3px] border-l-warn-edge bg-warn-tint ${PAD} py-2.5 text-warn`}>
      {broken.map((w) =>
        w.state?.state === "not_working" ? (
          <p key={w.kind}>
            <span className="font-semibold text-ink">{KIND_NAME[w.kind]} is not working</span>
            {w.state.since ? ` since ${shortDate(w.state.since)}` : ""}: {w.state.reason}. {FIX[w.state.fix] ?? ""}
          </p>
        ) : null,
      )}
    </div>
  );
}

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0E9F6E"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Done"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
