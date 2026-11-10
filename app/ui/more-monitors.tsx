"use client";

/**
 * Add more monitors: pages to watch on top of the pricing page and changelog, picked before Start watching.
 * Recommended pages come from a free scan of their site. Any other page can be added by its address.
 * Nothing is created here: the picked pages join the Add panel's list, and Start watching creates them.
 */
import { useEffect, useState } from "react";
import type { MorePage } from "@/lib/find-pages";
import { guessPage } from "@/lib/page-types";
import { shortUrl } from "./format";
import { Modal } from "./modal";
import { Tag } from "./tag";

async function post<T>(url: string, body: unknown): Promise<T & { status: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as T & { status: string };
  } catch {
    return { status: "failed" } as T & { status: string };
  }
}

/** "acme.com/security/" -> "Security". */
function nameFromAddress(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).at(-1);
    const word = (last ?? u.hostname.replace(/^www\./, "").split(".")[0]).replace(/[-_]+/g, " ").replace(/\.\w+$/, "");
    return word.charAt(0).toUpperCase() + word.slice(1, 40);
  } catch {
    return "Page";
  }
}

export function MoreMonitorsModal({
  domain,
  chosen,
  onAdd,
  onClose,
}: {
  domain: string;
  /** Addresses already in the Add panel's list, so they are not offered again. */
  chosen: string[];
  onAdd: (pages: MorePage[]) => void;
  onClose: () => void;
}) {
  const [found, setFound] = useState<MorePage[] | null>(null);
  const [typed, setTyped] = useState<MorePage[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    post<{ pages: MorePage[] }>("/api/more-pages", { domain, chosen }).then((body) => setFound(body.status === "ok" ? body.pages : []));
  }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = [...(found ?? []), ...typed];
  const toggle = (url: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  async function check() {
    const address = input.trim();
    if (!address || checking) return;
    setChecking(true);
    setError(null);
    const body = await post<{ url: string }>("/api/check-address", { url: address });
    setChecking(false);
    if (body.status !== "ok") return setError(`We couldn't open ${address}. Check the address and try again.`);
    if ([...chosen, ...pages.map((p) => p.url)].includes(body.url)) return setError("That page is already in the list.");
    // Its words decide its type: "/careers" is a careers page, "/pricing" a pricing page, anything else another page.
    const guess = guessPage(body.url);
    const label = nameFromAddress(body.url);
    setTyped((t) => [
      ...t,
      guess.kind === "page" ? { kind: "page", url: body.url, label, page: guess.page } : { kind: guess.kind, url: body.url, label },
    ]);
    setPicked((p) => new Set(p).add(body.url));
    setInput("");
  }

  const count = picked.size;
  return (
    <Modal
      title="Add more monitors"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-body h-(--control-h) rounded-[6px] border border-rule bg-white px-4 text-ink hover:border-edge"
          >
            <span className="btn-label">Cancel</span>
          </button>
          <button
            type="button"
            disabled={!count}
            onClick={() => {
              onAdd(pages.filter((p) => picked.has(p.url)));
              onClose();
            }}
            className="text-body h-(--control-h) rounded-[6px] bg-ink px-4 font-semibold text-white hover:bg-[#2f3a48] disabled:opacity-40"
          >
            <span className="btn-label">{count ? `Add ${count} ${count === 1 ? "monitor" : "monitors"}` : "Add monitors"}</span>
          </button>
        </div>
      }
    >
      <p className="text-body text-copy">Each page becomes its own monitor and is checked as often as the others.</p>

      <h3 className="text-small mt-4 mb-2 font-semibold text-ink">Suggested monitors</h3>
      {found === null ? (
        <div aria-busy="true" className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ui-skeleton h-11 w-full rounded-[8px]" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <p className="text-small text-muted">We found no other pages on their site to suggest. Add one by its address below.</p>
      ) : (
        <ul className="ui-fade-in flex flex-col gap-1.5">
          {pages.map((p) => {
            const on = picked.has(p.url);
            return (
              <li key={p.url}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 transition-colors ${
                    on ? "border-ink/70 bg-ink/[0.04]" : "border-rule bg-white hover:border-edge"
                  }`}
                >
                  <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(p.url)} />
                  <span
                    aria-hidden
                    className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-ink/25 ${
                      on ? "border-ink bg-ink text-white" : "border-edge bg-white"
                    }`}
                  >
                    {on && (
                      <svg
                        width="11"
                        height="11"
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
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-body block font-semibold text-ink">{p.label}</span>
                    <span className="text-small block truncate text-muted">{shortUrl(p.url)}</span>
                  </span>
                  <Tag kind={p.kind} label={p.label} page={p.page} />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="text-small mt-5 mb-2 font-semibold text-ink">Custom monitor</h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder={`${domain}/security`}
          aria-label="Page address"
          className="ui-field text-body h-(--control-h) min-w-0 flex-1 rounded-[6px] border border-rule bg-white px-3"
        />
        <button
          type="button"
          onClick={check}
          disabled={!input.trim() || checking}
          className="text-body h-(--control-h) shrink-0 rounded-[6px] border border-rule bg-white px-3 text-ink hover:border-edge disabled:opacity-40"
        >
          {checking ? <span className="ui-spinner" /> : <span className="btn-label">Add</span>}
        </button>
      </div>
      {error ? (
        <p className="text-small mt-1.5 text-warn">{error}</p>
      ) : (
        <p className="text-small mt-1.5 text-muted">Any page on their site, such as a jobs board or a partners page.</p>
      )}
    </Modal>
  );
}
