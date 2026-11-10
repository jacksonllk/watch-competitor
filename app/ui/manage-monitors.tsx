"use client";

/**
 * Manage monitors on the competitor page: the same list as the Add panel's step 03, for a competitor already watched.
 * Opened by the gear at the end of the filter row. Each page monitor can change its address or be removed.
 * A pricing page or changelog that is not watched can be given an address. Add monitors opens the same picker as the
 * Add panel and creates the monitors at once. News search shows too, so every list of monitors has the same two groups.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MonitorKind } from "@/lib/competitors";
import type { MorePage } from "@/lib/find-pages";
import type { PageType } from "@/lib/page-types";
import { shortUrl } from "./format";
import { HoverCard } from "./hover-card";
import { Kbd } from "./kbd";
import { Modal } from "./modal";
import { MonitorRow, ROW_BUTTON } from "./monitor-row";
import { MoreMonitorsModal } from "./more-monitors";
import { DemoModal } from "./demo-modal";
import { useNotify } from "./shell";
import { Tag } from "./tag";

/** A page monitor as the list shows it. url is null for a pricing page or changelog that is not watched. */
/** settingUp: its first check is running. The row says so in words; the spinner is the set-up box's on the page. */
export type ManagedMonitor = {
  kind: MonitorKind;
  label: string;
  page?: PageType;
  url: string | null;
  monitorId?: string;
  reports: string;
  settingUp?: boolean;
};
/**
 * demo: the public demo. Every button works up to its last step: Add monitors opens the picker, Change and Add address open
 * the address box, Remove asks. The last step (adding, Save, Remove) opens how to run your own copy. Nothing changes.
 */
type Props = { slug: string; name: string; domain: string; monitors: ManagedMonitor[]; news: { on: boolean; everyDays: number }; demo: boolean };
type Reply = { status: string; count?: number; label?: string };

const DEMO = "The demo can't change monitors. Run your own copy to manage them.";

async function send(url: string, method: "POST" | "DELETE", body: unknown): Promise<Reply> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return await res.json();
  } catch {
    return { status: "failed" };
  }
}

/** Plain words for an answer that is not ok. */
function problemOf(reply: Reply, address?: string): string {
  if (reply.status === "page_not_found") return `We couldn't open ${address ?? `the ${reply.label ?? ""} page`}. Check the address and try again.`;
  if (reply.status === "already_watched") return "That page is already watched.";
  // Plan limits and credits are the developer's to fix: neutral words here, the cause in the server log.
  if (reply.status === "no_monitor_slots") return "This copy is watching as many pages as it can. Remove a monitor to add another.";
  if (reply.status === "out_of_credits") return "The check failed. Contact support.";
  if (reply.status === "demo") return DEMO;
  return "Something went wrong. Try again in a minute.";
}

/** The gear after the competitor page's filter chips: no outline, ink, the chips' height. Hover names it. */
export function ManageMonitorsButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HoverCard card="Manage monitors" compact>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Manage monitors"
          className="flex size-8 items-center justify-center rounded-[6px] text-ink hover:bg-panel-2"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </HoverCard>
      {open && <ManageMonitorsModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ManageMonitorsModal({ slug, name, domain, monitors, news, demo, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const notify = useNotify();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showDemoCard, setShowDemoCard] = useState(false);
  const base = `/api/competitors/${encodeURIComponent(slug)}`;

  const done = (message: string) => {
    notify(message);
    router.refresh();
    // The change is done: close, so the set-up box on the page is the one place that shows the first check running.
    onClose();
  };

  async function add(pages: MorePage[]) {
    // The demo's competitors are watched on the demo's key: show how to add monitors in your own copy instead.
    if (demo) return setShowDemoCard(true);
    setAdding(true);
    setProblem(null);
    const reply = await send(`${base}/monitors`, "POST", { more: pages });
    setAdding(false);
    if (reply.status !== "added") return setProblem(problemOf(reply));
    const n = reply.count ?? pages.length;
    done(`Added ${n} ${n === 1 ? "monitor" : "monitors"}. ${n === 1 ? "Its first check is" : "Their first checks are"} running.`);
  }

  return (
    <Modal
      title={`Monitors for ${name}`}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="text-body h-(--control-h) rounded-[6px] border border-rule bg-white px-4 text-ink hover:border-edge"
        >
          <span className="btn-label">Done</span>
        </button>
      }
    >
      <h4 className="text-small mb-2 font-semibold text-muted">Page monitors</h4>
      <div>
        {monitors.map((m) => (
          <PageMonitor
            key={m.monitorId ?? m.kind}
            monitor={m}
            domain={domain}
            base={base}
            onDone={done}
            onDemo={demo ? () => setShowDemoCard(true) : null}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-3 pt-1">
        {problem && <p className="text-small mr-auto text-warn">{problem}</p>}
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={adding}
          className="text-small h-7 min-w-28 shrink-0 rounded-[6px] bg-ink px-3 font-semibold text-white hover:bg-[#2f3a48] disabled:opacity-60"
        >
          {adding ? <span className="ui-spinner" /> : "Add monitors"}
        </button>
      </div>

      <h4 className="text-small mt-3 mb-2 border-t border-rule pt-3 font-semibold text-muted">News search</h4>
      <div>
        <MonitorRow tag={<Tag kind="news" />}>
          <div className="text-small flex min-h-6 items-center text-copy">
            {news.on
              ? `Searched ${news.everyDays === 1 ? "daily" : `every ${news.everyDays} days`} for new articles about ${name}.`
              : `Off for ${name}. It was turned off when they were added.`}
          </div>
        </MonitorRow>
      </div>

      {showDemoCard && (
        <DemoModal
          intro="This demo shows the steps. To add, change or remove monitors, run your own copy. It takes about 5 minutes."
          last={{ title: "Manage monitors in your copy", text: "Open a competitor, then the gear next to its filters, and do the same steps." }}
          onClose={() => setShowDemoCard(false)}
        />
      )}
      {picking && (
        <MoreMonitorsModal
          domain={domain}
          chosen={monitors.flatMap((m) => (m.url ? [m.url] : []))}
          onAdd={(pages) => void add(pages)}
          onClose={() => setPicking(false)}
        />
      )}
    </Modal>
  );
}

/**
 * One page monitor. Change: a new address for the same monitor (a page that moved). Remove: asks once in the row.
 * A pricing page or changelog that is not watched offers Add address, which creates its monitor.
 */
function PageMonitor({
  monitor: m,
  domain,
  base,
  onDone,
  onDemo,
}: {
  monitor: ManagedMonitor;
  domain: string;
  base: string;
  onDone: (message: string) => void;
  /** The demo: Save and Remove open how to run your own copy instead of changing the monitor. */
  onDemo: (() => void) | null;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const page = m.label.toLowerCase();
  const bare = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const edit = () => {
    setInput(m.url ? bare(m.url) : "");
    setProblem(null);
    setMode("edit");
  };
  const cancel = () => {
    setProblem(null);
    setMode("view");
  };

  async function save() {
    const address = input.trim();
    if (!address || busy || (m.url && address === bare(m.url))) return;
    if (onDemo) {
      setMode("view");
      return onDemo();
    }
    setBusy(true);
    setProblem(null);
    const reply = m.monitorId
      ? await send(`${base}/address`, "POST", { monitorId: m.monitorId, url: address })
      : await send(`${base}/monitors`, "POST", { more: [{ kind: m.kind, url: address, label: m.label }] });
    setBusy(false);
    if (reply.status === "updated") onDone(`Saved. The first check of the new ${page} address is running.`);
    else if (reply.status === "added") onDone(`Now watching their ${page} page. Its first check is running.`);
    else return setProblem(problemOf(reply, address));
    setMode("view");
  }

  async function remove() {
    if (!m.monitorId) return;
    if (onDemo) {
      setMode("view");
      return onDemo();
    }
    setBusy(true);
    setProblem(null);
    const reply = await send(`${base}/monitors`, "DELETE", { monitorId: m.monitorId });
    setBusy(false);
    if (reply.status !== "removed") return setProblem(problemOf(reply));
    setMode("view");
    onDone(`Stopped watching their ${page} page. The changes it found stay on the timeline.`);
  }

  const warnButton = `${ROW_BUTTON} min-w-16 border-warn-edge/50 font-semibold text-warn hover:border-warn-edge hover:text-warn`;
  const action =
    mode === "edit" ? (
      <>
        <button type="button" onClick={cancel} className={ROW_BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy || !input.trim()} className={`${ROW_BUTTON} min-w-12 font-semibold text-ink`}>
          {busy ? <span className="ui-spinner" /> : "Save"}
        </button>
      </>
    ) : mode === "confirm" ? (
      <>
        <button type="button" onClick={cancel} className={ROW_BUTTON}>
          Keep
        </button>
        <button type="button" onClick={remove} disabled={busy} className={warnButton}>
          {busy ? <span className="ui-spinner" /> : "Remove"}
        </button>
      </>
    ) : m.url ? (
      <>
        <button type="button" onClick={edit} className={ROW_BUTTON}>
          Change
        </button>
        <button
          type="button"
          onClick={() => {
            setProblem(null);
            setMode("confirm");
          }}
          className={ROW_BUTTON}
        >
          Remove
        </button>
      </>
    ) : (
      <button type="button" onClick={edit} className={ROW_BUTTON}>
        Add address
      </button>
    );

  return (
    <MonitorRow tag={<Tag kind={m.kind} label={m.label} page={m.page} />} action={action}>
      {mode === "edit" ? (
        <>
          <label className="ui-field flex h-(--control-h-sm) items-center gap-2 rounded-[6px] px-2.5">
            <input
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setProblem(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  cancel();
                }
              }}
              enterKeyHint="go"
              aria-label={`${m.label} address`}
              placeholder={`${domain}/${m.kind === "page" ? (m.page ?? "page") : m.kind}`}
              className="text-small h-full min-w-0 flex-1 placeholder:text-muted"
            />
            {busy ? <span className="ui-spinner text-muted" aria-label="Checking" /> : input.trim() && <Kbd>Enter</Kbd>}
          </label>
          <p className={`text-small mt-1 ${problem ? "text-warn" : "text-muted"}`}>
            {problem ?? "We check that it opens, then watch it from today. Changes found before stay on the timeline."}
          </p>
        </>
      ) : (
        <>
          <div className="text-small flex min-h-6 items-center text-copy" title={m.url ?? undefined}>
            <span className={`truncate ${m.url ? "" : "text-muted"}`}>{m.url ? shortUrl(m.url) : "Not watched."}</span>
            {m.settingUp && mode === "view" && <span className="ml-2 shrink-0 text-muted">First check running</span>}
          </div>
          {problem ? (
            <p className="text-small mt-0.5 text-warn">{problem}</p>
          ) : mode === "confirm" ? (
            <p className="text-small mt-0.5 text-warn">Stop watching this page? The changes it found stay on the timeline.</p>
          ) : (
            m.url && <p className="text-small mt-0.5 text-muted">{m.reports}</p>
          )}
        </>
      )}
    </MonitorRow>
  );
}
