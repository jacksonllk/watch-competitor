/** One monitor as a row: its tag, what it watches and what it reports, and its button. */

export const ROW_BUTTON =
  "text-small h-6 rounded-[5px] border border-rule bg-white px-2 text-copy hover:border-edge hover:text-ink disabled:opacity-40";

/**
 * The tag on the left, what it watches in the middle, its button on the right. Used by the Add panel's step 03 and
 * Manage monitors, for page monitors and News alike, so every list of monitors lines up the same way.
 */
export function MonitorRow({ tag, action, children }: { tag: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-3 border-t border-rule py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[80px_minmax(0,1fr)_auto]">
      <div className="flex h-6 items-center">{tag}</div>
      <div className="min-w-0">{children}</div>
      {/* On a phone the buttons sit under the text, so the address keeps the row's width. */}
      {action && <div className="col-start-2 mt-1.5 flex h-6 items-center gap-1.5 sm:col-start-auto sm:mt-0">{action}</div>}
    </div>
  );
}
