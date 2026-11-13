"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useNotify } from "./shell";

type Action = { label: string; confirm: string; detail: string; go: string; danger?: boolean; run: () => Promise<string | null> };

async function call(url: string, method: "POST" | "DELETE"): Promise<{ status: string; pages?: number }> {
  try {
    return await (await fetch(url, { method })).json();
  } catch {
    return { status: "failed" };
  }
}

/** A button that asks once, in a small card under it, before it does something that costs credits or cannot be undone. */
function ConfirmButton({ action, primary = false }: { action: Action; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function go() {
    setBusy(true);
    setProblem(null);
    const error = await action.run();
    setBusy(false);
    if (error) setProblem(error);
    else setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`text-body h-8 rounded-[6px] px-3 ${
          primary ? "bg-ink font-semibold text-white hover:bg-[#2f3a48]" : "border border-rule bg-white text-ink hover:border-edge"
        }`}
      >
        <span className="btn-label">{action.label}</span>
      </button>
      {open && (
        <div
          role="dialog"
          className="ui-fade-in absolute top-10 right-0 z-30 w-72 rounded-[8px] border border-rule bg-white p-4 shadow-[0_8px_24px_rgba(27,36,48,0.12)]"
        >
          <p className="text-body font-semibold">{action.confirm}</p>
          <p className="text-small mt-1 text-copy">{action.detail}</p>
          {problem && (
            <p className="text-small mt-2 text-warn">
              {problem}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={go}
              disabled={busy}
              className={`text-body flex h-8 min-w-24 items-center justify-center gap-2 rounded-[6px] px-3 font-semibold text-white disabled:opacity-60 ${
                action.danger ? "bg-[#B42318] hover:bg-[#912018]" : "bg-ink hover:bg-[#2f3a48]"
              }`}
            >
              {busy ? <span className="ui-spinner" /> : <span className="btn-label">{action.go}</span>}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-body h-8 rounded-[6px] border border-rule bg-white px-3 hover:border-edge"
            >
              <span className="btn-label">Cancel</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function CompetitorActions({ slug, name, pages, removed }: { slug: string; name: string; pages: number; removed: boolean }) {
  const router = useRouter();
  const notify = useNotify();
  const base = `/api/competitors/${encodeURIComponent(slug)}`;

  if (removed) {
    return (
      <ConfirmButton
        action={{
          label: "Delete history",
          confirm: `Delete everything saved about ${name}?`,
          detail: "Its timeline and news are deleted from your store. This cannot be undone.",
          go: "Delete",
          danger: true,
          run: async () => {
            const body = await call(base, "DELETE");
            if (body.status !== "deleted") return "Could not delete it. Try again.";
            notify(`Deleted ${name} and its history.`);
            router.push("/");
            return null;
          },
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      {pages > 0 && (
        <ConfirmButton
          action={{
            label: "Check now",
            confirm: `Check ${plural(pages, "page")} now?`,
            detail: "Results show here within a few minutes.",
            go: "Check now",
            run: async () => {
              const body = await call(`${base}/check`, "POST");
              // The developer's account ran out (the server log says so). Never name the vendor or credits here.
              if (body.status === "out_of_credits") return "The check failed. Contact support.";
              if (body.status !== "started") return "Could not start the check. Try again in a minute.";
              notify(`Checking ${plural(body.pages ?? pages, "page")}. Results show here within a few minutes.`);
              return null;
            },
          }}
        />
      )}
      <ConfirmButton
        action={{
          label: "Remove",
          confirm: `Stop watching ${name}?`,
          detail: `We stop checking ${name}. Its timeline so far stays here, and you can delete it later.`,
          go: "Remove",
          danger: true,
          run: async () => {
            const body = await call(`${base}/remove`, "POST");
            if (body.status !== "removed") return "Could not remove it. Try again.";
            notify(`Stopped watching ${name}. Its saved timeline stays.`);
            router.refresh();
            return null;
          },
        }}
      />
    </div>
  );
}
