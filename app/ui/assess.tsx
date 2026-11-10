"use client";

/**
 * Assess on a change: what changed, then the prompt the user copies for their AI agent.
 * The prompt always asks for an assessment and a recommendation. Each ticked task is added to it.
 * The prompt is shown in full, so the user sees exactly what they copy.
 * The prompt is built in the browser from the frame the server made, so ticking a task updates it at once.
 */
import { useMemo, useState } from "react";
import { ASSESS, joinPrompt, renderTasks } from "@/lib/prompt";
import type { AssessData } from "./assess-data";
import { ChangeRows } from "./changes";
import { Sheet, useSheet } from "./sheet";
import { useNotify } from "./shell";
import { Tag } from "./tag";

/** Assess on a change. The same outline button on every change: the app never suggests which ones need action. */
export function AssessButton({ data }: { data: AssessData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-small h-7 shrink-0 rounded-[6px] border border-rule bg-white px-2.5 font-semibold text-ink hover:border-edge"
      >
        <span className="btn-label">Assess</span>
      </button>
      {open && <AssessPanel data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The tasks last ticked for this event type, kept in this browser only. */
const memoryKey = (kind: string) => `watch-competitor:assess:${kind}`;
function remembered(kind: string, ids: string[]): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(memoryKey(kind)) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && ids.includes(id)) : [];
  } catch {
    return [];
  }
}

function AssessPanel({ data, onClose }: { data: AssessData; onClose: () => void }) {
  const { shown, close } = useSheet(onClose);
  const notify = useNotify();
  const [copied, setCopied] = useState(false);
  const extra = data.tasks.filter((t) => t.id !== ASSESS);
  const assess = data.tasks.find((t) => t.id === ASSESS);
  // The panel only opens after a click, in the browser, so it reads what was ticked last time as it starts.
  const [chosen, setChosen] = useState<string[]>(() =>
    remembered(
      data.kind,
      extra.map((t) => t.id),
    ),
  );

  const generated = useMemo(() => joinPrompt(data.frame, renderTasks(data.tasks, chosen)), [data, chosen]);
  // The user's own edits to the prompt. null until they type. Copy always copies what the box shows.
  const [edited, setEdited] = useState<string | null>(null);
  const prompt = edited ?? generated;

  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
    // Keep the user's edits: swap only the task list inside them, if they left it as it was.
    if (edited !== null) {
      const before = renderTasks(data.tasks, chosen);
      if (edited.includes(before)) setEdited(edited.replace(before, renderTasks(data.tasks, next)));
    }
    setChosen(next);
    try {
      localStorage.setItem(memoryKey(data.kind), JSON.stringify(next));
    } catch {}
  };
  const tasksLocked = edited !== null && !edited.includes(renderTasks(data.tasks, chosen));

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      notify("Prompt copied. Paste it into your AI agent.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Could not copy. Open the prompt and copy it by hand.");
    }
  }

  return (
    <Sheet
      title="Assess"
      shown={shown}
      onClose={close}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="text-body flex h-(--control-h) min-w-32 shrink-0 items-center justify-center gap-2 rounded-[6px] bg-ink px-4 font-semibold text-white hover:bg-[#2f3a48]"
          >
            {copied ? (
              <>
                <Check />
                Copied
              </>
            ) : (
              <span className="btn-label">Copy prompt</span>
            )}
          </button>
          <p className="text-small text-muted">The prompt tells your agent to draft only and to ask before it changes anything.</p>
        </div>
      }
    >
      <section className="border-b border-rule px-5 py-4">
        <div className="flex gap-3">
          <Tag kind={data.kind} label={data.label} page={data.page} />
          <div className="min-w-0">
            <h3 className="text-body font-semibold">{data.title}</h3>
            <p className="text-small text-muted">
              {data.competitor} · detected {data.detected} ·{" "}
              <a href={data.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
                Source
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-rule px-5 py-4">
        <h3 className="text-body mb-2 font-semibold">What changed</h3>
        {data.summary && <p className="text-body mb-2.5 text-copy">{data.summary}</p>}
        <ChangeRows rows={data.rows} />
      </section>

      <section className="px-5 py-4">
        <h3 className="text-body font-semibold">Prompt for your AI agent</h3>
        {assess?.outcome && <p className="text-body mt-1 text-copy">{assess.outcome}</p>}
        <p className="text-small mt-4 mb-2 font-semibold text-ink">Also ask it to</p>
        <ul className="flex flex-col gap-1.5">
          {extra.map((t) => (
            <li key={t.id}>
              <TaskRow label={t.label} checked={chosen.includes(t.id)} onToggle={() => toggle(t.id)} />
            </li>
          ))}
        </ul>
        <div className="mt-4 mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={`prompt-${data.id}`} className="text-small font-semibold text-ink">
            Prompt
          </label>
          {edited !== null && edited !== generated && (
            <button type="button" onClick={() => setEdited(null)} className="text-small text-muted underline-offset-2 hover:text-ink hover:underline">
              Reset to the generated prompt
            </button>
          )}
        </div>
        <textarea
          id={`prompt-${data.id}`}
          value={prompt}
          onChange={(e) => setEdited(e.target.value)}
          spellCheck={false}
          rows={14}
          className="ui-field text-small block h-[360px] w-full resize-y rounded-[8px] border border-rule bg-panel p-3 font-sans text-copy focus:bg-white"
        />
        <p className="text-small mt-1.5 text-muted">
          {tasksLocked ? "You edited the task list, so ticking a box no longer changes it." : "You can edit the prompt before you copy it."}
        </p>
      </section>
    </Sheet>
  );
}

/** One task: a box, its name and what the agent gives back. The whole row toggles it. */
/** One thing to add to the prompt. The whole row toggles it. */
function TaskRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <label
      className={`text-body flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2 text-ink transition-colors ${
        checked ? "border-ink/70 bg-ink/[0.04]" : "border-rule bg-white hover:border-edge"
      }`}
    >
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onToggle} />
      <span
        aria-hidden
        className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border peer-focus-visible:ring-2 peer-focus-visible:ring-ink/25 ${
          checked ? "border-ink bg-ink text-white" : "border-edge bg-white"
        }`}
      >
        {checked && <Check size={11} />}
      </span>
      {label}
    </label>
  );
}

function Check({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
