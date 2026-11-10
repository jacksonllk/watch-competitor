import type { ChangeRow } from "@/lib/what-changed";

const LABEL: Record<ChangeRow["type"], string> = { changed: "Changed", added: "New", removed: "Removed", text: "Article" };

function Arrow() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-muted"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/**
 * The "What changed" rows. An old -> new change shows as Before and After side by side, the new value in bold.
 * New and removed lines keep a small label, since that is the whole point of them. Never a raw diff.
 */
export function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  if (!rows.length) return null;
  const changed = rows.filter((r): r is Extract<ChangeRow, { type: "changed" }> => r.type === "changed");
  const others = rows.filter((r) => r.type !== "changed");
  return (
    <div className="flex flex-col gap-3">
      {changed.map((row, i) => (
        <div key={`c${i}`}>
          {row.label && <p className="text-small mb-1 font-semibold text-ink">{row.label}</p>}
          <div className="grid grid-cols-1 items-stretch gap-1.5 sm:grid-cols-[1fr_auto_1fr] sm:gap-2">
            <div className="rounded-[8px] border border-rule bg-panel px-3 py-2">
              <p className="text-label text-muted">Before</p>
              <p className="text-body text-muted">{row.before}</p>
            </div>
            <span className="flex items-center justify-center text-muted max-sm:rotate-90">
              <Arrow />
            </span>
            <div className="rounded-[8px] border border-ink/70 bg-white px-3 py-2">
              <p className="text-label text-muted">After</p>
              <p className="text-body font-semibold text-ink">{row.after}</p>
            </div>
          </div>
        </div>
      ))}
      {others.length > 0 && (
        <dl className="border-t border-rule">
          {others.map((row, i) => (
            <div key={`o${i}`} className="grid grid-cols-[76px_1fr] gap-3 border-b border-rule py-2 last:border-b-0">
              <dt className="label pt-0.5">{LABEL[row.type]}</dt>
              <dd className="text-body min-w-0">{"text" in row ? row.text : ""}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export { Arrow };
