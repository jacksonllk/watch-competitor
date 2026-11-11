"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Article } from "@/lib/news";
import type { MorePage } from "@/lib/find-pages";
import type { Company, Preview } from "@/lib/preview";
import { shortDate, shortUrl } from "./format";
import { Kbd } from "./kbd";
import { CompanyMark } from "./mark";
import { DemoModal } from "./demo-modal";
import { MonitorRow, ROW_BUTTON } from "./monitor-row";
import { MoreMonitorsModal } from "./more-monitors";
import { PAGE_DESCRIPTIONS } from "@/lib/page-types";
import { Tag } from "./tag";
import { SupportText } from "./support-text";
import { Sheet, useSheet } from "./sheet";
import { useDemo } from "./shell";

type Kind = "changelog" | "pricing";
/** url: what will be watched. found: what the scan found, for Undo. */
type PageChoice = {
  url: string | null;
  found: string | null;
  others: string[];
  source: "found" | "typed" | "none";
  editing: boolean;
  input: string;
  checking: boolean;
  error: string | null;
};
type Problem = { text: string; detail?: string };

const NEWS_SHOWN = 3;
const KIND_LABEL: Record<Kind, string> = { changelog: "Changelog", pricing: "Pricing" };

/** Plain words for an API answer that is not ok. */
function problemOf(body: { status?: string; cap?: number; nextRefillAt?: string | null; message?: string }, demoMode = false): Problem {
  switch (body.status) {
    case "cap_reached":
      return {
        text: "Today's company lookups are used up. They start again at 00:00 UTC.",
        detail: demoMode ? "Or run your own copy to look up any company." : undefined,
      };
    case "out_of_credits":
      // The developer's account, not the user's problem: neutral words here, the cause in the server log.
      return { text: "Company lookup failed. Contact support." };
    case "setup_needed":
      return { text: body.message ?? "The app is not set up yet." };
    default:
      return { text: "Something went wrong. Try again in a minute." };
  }
}

async function post<T>(url: string, body: unknown): Promise<T & { status: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as T & { status: string };
  } catch {
    return { status: "failed" } as T & { status: string };
  }
}

export function AddPanel({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Company[] | null>(null);
  const [watching, setWatching] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);
  const [searchProblem, setSearchProblem] = useState<Problem | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [focus, setFocus] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [descriptions, setDescriptions] = useState<Record<Kind, string> | null>(null);
  const [newsDays, setNewsDays] = useState(1);
  const [monitors, setMonitors] = useState<{ used: number; limit: number } | null>(null);
  const [alreadyWatching, setAlreadyWatching] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewProblem, setPreviewProblem] = useState<Problem | null>(null);
  const [pages, setPages] = useState<Record<Kind, PageChoice> | null>(null);
  const [more, setMore] = useState<MorePage[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startProblem, setStartProblem] = useState<Problem | null>(null);
  const searchSeq = useRef(0);
  const demo = useDemo();
  const [showDemoCard, setShowDemoCard] = useState(false);

  const { shown, close } = useSheet(onClose);

  // Searches only on Enter: each new search costs 1 credit. Repeats are cached for 24 hours.
  async function search() {
    const q = query.trim();
    if (q.length < 2 || searching) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchProblem(null);
    const body = await post<{ companies: Company[]; watching: Record<string, string> }>("/api/companies", { query: q });
    if (seq !== searchSeq.current) return;
    setSearching(false);
    if (body.status === "ok") {
      setResults(body.companies);
      setWatching(body.watching ?? {});
    } else {
      setResults(null);
      setSearchProblem(problemOf(body, demo));
    }
  }

  function openWatched(domain: string) {
    close();
    router.push(`/c/${encodeURIComponent(watching[domain])}`);
  }

  async function choose(next: Company) {
    setCompany(next);
    setPreview(null);
    setMore([]);
    setPreviewProblem(null);
    setStartProblem(null);
    setLoadingPreview(true);
    const body = await post<{
      preview: Preview;
      spent: { credits: number };
      descriptions: Record<Kind, string>;
      newsEveryDays: number;
      monitors: { used: number; limit: number } | null;
      watching: boolean;
    }>("/api/preview", { domain: next.domain, query });
    setLoadingPreview(false);
    if (body.status !== "ok") {
      setPreviewProblem(problemOf(body, demo));
      return;
    }
    setPreview(body.preview);
    setDescriptions(body.descriptions);
    setNewsDays(body.newsEveryDays ?? 1);
    setMonitors(body.monitors);
    setAlreadyWatching(body.watching);
    setCompany(body.preview.company);
    const choice = (kind: Kind): PageChoice => {
      const found = body.preview.pages[kind];
      return {
        url: found?.url ?? null,
        found: found?.url ?? null,
        others: found?.others ?? [],
        source: found ? "found" : "none",
        editing: !found,
        input: "",
        checking: false,
        error: null,
      };
    };
    setPages({ changelog: choice("changelog"), pricing: choice("pricing") });
  }

  function reset() {
    setCompany(null);
    setPreview(null);
    setMore([]);
    setPages(null);
    setPreviewProblem(null);
    setStartProblem(null);
  }

  function updatePage(kind: Kind, patch: Partial<PageChoice>) {
    setPages((p) => (p ? { ...p, [kind]: { ...p[kind], ...patch } } : p));
  }

  async function checkTyped(kind: Kind) {
    const input = pages?.[kind].input.trim();
    if (!input) return;
    updatePage(kind, { checking: true, error: null });
    const body = await post<{ url: string }>("/api/check-address", { url: input });
    if (body.status === "ok")
      updatePage(kind, { url: body.url, source: body.url === pages?.[kind].found ? "found" : "typed", editing: false, checking: false, input: "" });
    else updatePage(kind, { checking: false, error: `We couldn't open ${input}. Check the address and try again.` });
  }

  async function start() {
    if (!company || !pages) return;
    // The public demo creates nothing: it shows how to run your own copy instead.
    if (demo) {
      setShowDemoCard(true);
      return;
    }
    setStarting(true);
    setStartProblem(null);
    const body = await post<{ used?: number; limit?: number; kind?: Kind; label?: string; competitor?: { slug: string } }>("/api/competitors", {
      domain: company.domain,
      focus,
      pages: { changelog: pages.changelog.url, pricing: pages.pricing.url },
      more,
    });
    setStarting(false);
    if (body.status === "added" || body.status === "already_watching") {
      close();
      // Show the competitor right away: its page has the setting-up checklist.
      if (body.competitor) router.push(`/c/${body.competitor.slug}`);
      else router.refresh();
      if (body.status === "added") onAdded(company.name);
      return;
    }
    if (body.status === "no_monitor_slots") {
      setStartProblem({
        text: "This copy is watching as many pages as it can. Watch fewer pages, or remove a competitor.",
      });
    } else if (body.status === "page_not_found" && body.label) {
      setStartProblem({ text: `The ${body.label} page no longer opens. Remove it, or add it again with a new address.` });
    } else if (body.status === "page_not_found" && body.kind) {
      setStartProblem({ text: `The ${KIND_LABEL[body.kind].toLowerCase()} address no longer opens. Change it, or watch without it.` });
    } else setStartProblem(problemOf(body));
  }

  const watched = pages ? (["changelog", "pricing"] as const).filter((k) => pages[k].url) : [];
  const total = watched.length + more.length;
  const fits = !monitors || monitors.used + total <= monitors.limit;
  const bare = query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
  const typedDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;

  return (
    <Sheet
      title="Add competitor"
      shown={shown}
      onClose={close}
      footer={
        preview && pages ? (
          <>
            {alreadyWatching ? (
              <div className="flex items-center gap-3">
                <WatchingBadge />
                <p className="text-body text-copy">You already watch {company?.name}. Its changes are on the Overview.</p>
              </div>
            ) : (
              <>
                {!fits && monitors && (
                  <p className="text-small mb-1 text-warn">
                    Your plan allows {monitors.limit} monitors and {monitors.used} are in use. Watch fewer pages, or remove a competitor.
                  </p>
                )}
                {startProblem && <ProblemText problem={startProblem} />}
                {showDemoCard && (
                  <DemoModal
                    intro="This demo shows the steps. To start watching, run your own copy. It takes about 5 minutes."
                    last={{
                      title: `Add ${company?.name ?? "this competitor"} in your copy`,
                      text: "Open Add competitor and go through the same steps you just tried.",
                    }}
                    onClose={() => setShowDemoCard(false)}
                  />
                )}
                {
                  <button
                    type="button"
                    disabled={starting || !fits || Object.values(pages).some((p) => p.checking)}
                    onClick={start}
                    className="text-body mt-2 flex h-(--control-h) w-full items-center justify-center rounded-[6px] bg-ink font-semibold text-white hover:bg-[#2f3a48] disabled:opacity-40"
                  >
                    {starting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="ui-spinner" /> Starting
                      </span>
                    ) : (
                      <span className="btn-label">Start watching</span>
                    )}
                  </button>
                }
              </>
            )}
          </>
        ) : null
      }
    >
      <Step n="01" title="Find the company">
        {company ? (
          <div className="ui-fade-in flex items-center gap-3 rounded-[8px] border border-rule bg-panel px-3 py-2.5">
            <CompanyMark name={company.name} logo={company.logo} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-body font-semibold">{company.name}</div>
              <div className="text-small text-muted">{company.domain}</div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-small h-7 rounded-[6px] border border-rule bg-white px-2.5 text-copy hover:border-edge hover:text-ink"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <label className="ui-field flex h-(--control-h) items-center gap-2.5 rounded-[6px] px-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResults(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && search()}
                enterKeyHint="search"
                placeholder="Company name or website"
                className="text-body h-full min-w-0 flex-1 placeholder:text-muted"
              />
              {searching ? <span className="ui-spinner text-muted" aria-label="Searching" /> : query.trim().length >= 2 && <Kbd>Enter</Kbd>}
            </label>
            {searchProblem && <ProblemText problem={searchProblem} />}
            {results && !searching && (
              <ul className="ui-fade-in mt-3 overflow-hidden rounded-[8px] border border-rule">
                {results.map((c) => (
                  <li key={c.domain} className="border-b border-rule last:border-b-0">
                    <button
                      type="button"
                      onClick={() => (watching[c.domain] ? openWatched(c.domain) : choose(c))}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-panel-2"
                    >
                      <CompanyMark name={c.name} logo={c.logo} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="text-body block truncate font-semibold">{c.name}</span>
                        <span className="text-small block truncate text-muted">{c.domain}</span>
                      </span>
                      {watching[c.domain] && <WatchingBadge />}
                    </button>
                  </li>
                ))}
                {typedDomain && !results.some((c) => c.domain === typedDomain) && (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        watching[typedDomain]
                          ? openWatched(typedDomain)
                          : choose({ name: typedDomain, domain: typedDomain, logo: null, description: null })
                      }
                      className="text-body flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-panel-2"
                    >
                      <span className="flex-1">
                        Use <span className="font-semibold">{typedDomain}</span>
                      </span>
                      {watching[typedDomain] && <WatchingBadge />}
                    </button>
                  </li>
                )}
                {!results.length && !typedDomain && (
                  <li className="text-body px-3 py-2.5 text-muted">No company found. Try its website, such as acme.com.</li>
                )}
              </ul>
            )}
          </>
        )}
      </Step>

      {company && (
        <>
          <Step n="02" title="What matters to you?" note="Optional">
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Only report changes about sandboxes."
              className="ui-field text-body w-full resize-none rounded-[6px] px-3 py-2 placeholder:text-muted"
            />
            <p className="text-small mt-1.5 text-muted">Narrows the changes shown from their changelog and any extra pages you add. Pricing and news are always shown in full.</p>
          </Step>

          <Step
            n="03"
            title="What we will watch"
            note={
              preview && pages
                ? `${total} ${total === 1 ? "monitor" : "monitors"} and ${newsDays === 1 ? "daily news" : `news every ${newsDays} days`}`
                : undefined
            }
          >
            {loadingPreview && (
              <div aria-busy="true">
                <div className="ui-skeleton h-3.5 w-1/3" />
                <div className="ui-skeleton mt-2 h-3 w-2/3" />
                <div className="ui-skeleton mt-5 h-3.5 w-1/3" />
                <div className="ui-skeleton mt-2 h-3 w-1/2" />
                <p className="text-small mt-4 text-muted">Scanning {company.domain} for a pricing page and changelog…</p>
              </div>
            )}
            {previewProblem && <ProblemText problem={previewProblem} />}
            {preview && pages && (
              <div className="ui-fade-in">
                <h4 className="text-small mb-2 font-semibold text-muted">Page monitors</h4>
                <div>
                  {(["changelog", "pricing"] as const).map((kind) => (
                    <PageRow
                      key={kind}
                      kind={kind}
                      domain={company.domain}
                      choice={pages[kind]}
                      reports={descriptions?.[kind] ?? ""}
                      onChange={(patch) => updatePage(kind, patch)}
                      onCheck={() => checkTyped(kind)}
                    />
                  ))}
                  {more.map((p) => (
                    <MonitorRow
                      key={p.url}
                      tag={<Tag kind={p.kind} label={p.label} page={p.page} />}
                      action={
                        <button type="button" onClick={() => setMore((m) => m.filter((x) => x.url !== p.url))} className={ROW_BUTTON}>
                          Remove
                        </button>
                      }
                    >
                      <div className="text-small flex min-h-6 items-center text-copy" title={p.url}>
                        <span className="truncate">{shortUrl(p.url)}</span>
                      </div>
                      <p className="text-small mt-0.5 text-muted">
                        {p.kind === "page" ? PAGE_DESCRIPTIONS[p.page ?? "other"] : (descriptions?.[p.kind] ?? "")}
                      </p>
                    </MonitorRow>
                  ))}
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setShowMore(true)}
                    className="text-small h-7 rounded-[6px] bg-ink px-3 font-semibold text-white hover:bg-[#2f3a48]"
                  >
                    Add monitors
                  </button>
                </div>

                <h4 className="text-small mt-3 mb-2 border-t border-rule pt-3 font-semibold text-muted">News search</h4>
                <div>
                  <MonitorRow tag={<Tag kind="news" />}>
                    <div className="text-small flex min-h-6 items-center text-copy">
                      Searched {newsDays === 1 ? "daily" : `every ${newsDays} days`} for new articles about {company.name}.
                    </div>
                    <NewsPreview preview={preview} />
                  </MonitorRow>
                </div>
                {showMore && (
                  <MoreMonitorsModal
                    domain={company.domain}
                    chosen={[pages.changelog.url, pages.pricing.url, ...more.map((p) => p.url)].filter((u): u is string => Boolean(u))}
                    onAdd={(added) => setMore((m) => [...m, ...added])}
                    onClose={() => setShowMore(false)}
                  />
                )}
              </div>
            )}
          </Step>

          {preview && (
            <Step n="04" title={`About ${company.name}`}>
              <p className="ui-fade-in text-body text-copy">{preview.company.description ?? "No description found for this company."}</p>
            </Step>
          )}
        </>
      )}
    </Sheet>
  );
}

function WatchingBadge() {
  return (
    <span className="text-label inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] bg-panel-2 px-1.5 font-semibold tracking-[0.06em] text-copy uppercase">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Watching
    </span>
  );
}

function Step({ n, title, note, children }: { n: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-rule px-5 py-4 last:border-b-0">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="figures text-small text-muted">{n}</span>
        <h3 className="text-body truncate font-semibold text-ink">{title}</h3>
        {note && <span className="text-small ml-auto shrink-0 text-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function ProblemText({ problem }: { problem: Problem }) {
  return (
    <div className="ui-fade-in mt-2.5">
      <p className="text-body text-warn">
        <SupportText text={problem.text} />
      </p>
      {problem.detail && <p className="text-small mt-1 text-muted">{problem.detail}</p>}
    </div>
  );
}

/** A taster of the news the daily search will follow: up to 3 recent headlines, or why there are none. */
function NewsPreview({ preview }: { preview: Preview }) {
  const articles: Article[] = preview.articles.slice(0, NEWS_SHOWN);
  const more = preview.articles.length - articles.length;
  if (!preview.news.ok) return <p className="text-small mt-0.5 text-muted">No news source covers this company yet.</p>;
  if (!articles.length) return <p className="text-small mt-0.5 text-muted">No news about {preview.company.name} in the last 90 days.</p>;
  return (
    <ul className="mt-1.5 space-y-1.5">
      {articles.map((a) => (
        <li key={a.id} className="text-small grid grid-cols-[72px_1fr] gap-2">
          <span className="text-muted">{a.published_at ? shortDate(a.published_at) : ""}</span>
          <a href={a.url} target="_blank" rel="noreferrer" title={a.title} className="truncate text-copy hover:text-ink hover:underline">
            {a.title}
          </a>
        </li>
      ))}
      {more > 0 && <li className="text-small pl-[80px] text-muted">and {more} more from the last 90 days</li>}
    </ul>
  );
}

function PageRow({
  kind,
  domain,
  choice,
  reports,
  onChange,
  onCheck,
}: {
  kind: Kind;
  domain: string;
  choice: PageChoice;
  reports: string;
  onChange: (patch: Partial<PageChoice>) => void;
  onCheck: () => void;
}) {
  const word = kind === "changelog" ? "changelog" : "pricing page";
  const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const action = "text-small rounded-[4px] text-copy underline-offset-2 hover:text-ink hover:underline";
  return (
    <MonitorRow
      tag={<Tag kind={kind} label={KIND_LABEL[kind]} />}
      action={
        choice.url &&
        !choice.editing && (
          <button type="button" onClick={() => onChange({ editing: true, error: null, input: bare(choice.url!) })} className={ROW_BUTTON}>
            Change
          </button>
        )
      }
    >
      {choice.editing ? (
        <>
          {!choice.url && !choice.found && (
            <p className="text-small flex min-h-6 items-center text-copy">
              We couldn&apos;t find a {word} on {domain}. Enter its address, or leave it empty to watch without it.
            </p>
          )}
          <label className={`ui-field flex ${choice.url || choice.found ? "" : "mt-1.5"} h-(--control-h-sm) items-center gap-2 rounded-[6px] px-2.5`}>
            <input
              autoFocus={Boolean(choice.url)}
              value={choice.input}
              onChange={(e) => onChange({ input: e.target.value, error: null })}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCheck();
                if (e.key === "Escape" && choice.url) {
                  e.stopPropagation();
                  onChange({ editing: false, input: "", error: null });
                }
              }}
              enterKeyHint="go"
              placeholder={`${domain}/${kind === "changelog" ? "changelog" : "pricing"}`}
              className="text-small h-full min-w-0 flex-1 placeholder:text-muted"
            />
            {choice.checking ? <span className="ui-spinner text-muted" aria-label="Checking" /> : choice.input.trim() && <Kbd>Enter</Kbd>}
          </label>
          {choice.error && <p className="text-small mt-1.5 text-warn">{choice.error}</p>}
          {(choice.url || choice.found) && (
            <div className="mt-1.5 flex items-center gap-3">
              {choice.url && (
                <button type="button" onClick={() => onChange({ editing: false, input: "", error: null })} className={action}>
                  Cancel
                </button>
              )}
              <button type="button" onClick={() => onChange({ url: null, editing: false, input: "", error: null })} className={action}>
                Watch without it
              </button>
            </div>
          )}
        </>
      ) : choice.url ? (
        <>
          <div className="text-small flex min-h-6 items-center text-copy" title={choice.url}>
            <span className="truncate">{shortUrl(choice.url)}</span>
          </div>
          {choice.others.length > 0 && (
            <div className="text-small text-muted">
              <>
                {"Also found "}
                {choice.others.map((o) => (
                  <button
                    key={o}
                    type="button"
                    title={o}
                    onClick={() => onChange({ url: o, others: [choice.url!, ...choice.others.filter((x) => x !== o)] })}
                    className="text-accent hover:underline"
                  >
                    {shortUrl(o)}
                  </button>
                ))}
              </>
            </div>
          )}
          {reports && <p className="text-small mt-0.5 text-muted">{reports}</p>}
        </>
      ) : (
        <div className="flex min-h-6 items-center gap-3">
          <span className="text-small text-muted">Not watched.</span>
          {choice.found && (
            <button type="button" onClick={() => onChange({ url: choice.found, source: "found" })} className={action}>
              Undo
            </button>
          )}
          <button type="button" onClick={() => onChange({ editing: true, input: "" })} className={action}>
            Add an address
          </button>
        </div>
      )}
    </MonitorRow>
  );
}
