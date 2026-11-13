/**
 * The box on the competitor page while a page monitor runs its first check.
 * A competitor just added (no page compared yet) gets the full steps: company details, news and each page.
 * A monitor added later gets one line per page whose first check runs, so it says exactly what is running.
 */

export type SetupStep = { state: "done" | "running" | "off" | "problem"; text: string };

/**
 * The steps for the box: what is done and what is still running, for where the user is. One rule, no separate states:
 * - a competitor just added (no page compared yet): its company details, its news search, then each page;
 * - a competitor watched already: only the pages whose first check is running (a new monitor or a new address).
 * Done steps say what was done. A failed step names the check ("Pricing check failed."). When the cause is the
 * developer's account (out of credits), it adds "Contact support." and never names the vendor or credits.
 * Pure: the review gallery renders it with made-up states.
 */
export function setupSteps(input: {
  isNew: boolean;
  /** null: news search turned off for this competitor, so it is not a step. support: the cause is the account, not the page. */
  news: { state: "setting_up" | "working" | "not_working" | "unknown"; noSource?: boolean; support?: boolean } | null;
  /** Reading their changelog at Add. null: not read, so it is not a step. support: the cause is the account. */
  history?: { ok: boolean; days: number; support?: boolean } | null;
  /** name: "their pricing page" for the running line. label: "Pricing" for the failed line. */
  monitors: { name: string; label: string; state: "setting_up" | "working" | "not_working" | "unknown"; support?: boolean }[];
}): SetupStep[] {
  const failed = (what: string, support?: boolean): SetupStep => ({
    state: "problem",
    text: `${what} check failed.${support ? " Contact support." : ""}`,
  });
  const pages = input.monitors.flatMap((m): SetupStep[] => {
    if (m.state === "setting_up") return [{ state: "running", text: `Running the first check of ${m.name}` }];
    if (!input.isNew) return [];
    if (m.state === "not_working") return [failed(m.label, m.support)];
    return [{ state: "done", text: `Saved a copy of ${m.name}` }];
  });
  if (!input.isNew) return pages;
  const n = input.news;
  // No outlet covering them is a result, not a failure: the search ran.
  const news: SetupStep[] = !n
    ? []
    : n.state === "setting_up"
      ? [{ state: "running", text: "Searching the news from the last 90 days" }]
      : n.state === "not_working" && !n.noSource
        ? [failed("News", n.support)]
        : [{ state: "done", text: "Searched the news from the last 90 days" }];
  const h = input.history;
  // Done when the read worked, even with no entries: the page was read, they shipped nothing in that window.
  const history: SetupStep[] = !h
    ? []
    : h.ok
      ? [{ state: "done", text: `Read their changelog from the last ${h.days} days` }]
      : [{ state: "problem", text: `Changelog history failed.${h.support ? " Contact support." : ""}` }];
  return [{ state: "done", text: "Found the company details" }, ...news, ...history, ...pages];
}

export function SettingUp({ isNew, steps, pad = "" }: { isNew: boolean; steps: SetupStep[]; pad?: string }) {
  const running = steps.filter((s) => s.state === "running" && s.text.startsWith("Running the first check")).length;
  return (
    <section className={`border-b border-rule ${pad} py-4`}>
      <div className="rounded-[8px] border border-dashed border-edge p-4">
        {isNew && <h2 className="text-body mb-3 font-semibold">Getting set up</h2>}
        <ul className="space-y-2">
          {steps.map((s) => (
            <li
              key={s.text}
              className={`text-body flex items-center gap-2.5 ${s.state === "problem" ? "text-warn" : s.state === "off" ? "text-muted" : ""}`}
            >
              <StepIcon state={s.state} />
              <span>
                {s.text}
              </span>
            </li>
          ))}
        </ul>
        {running > 0 && (
          <p className="text-small mt-2 text-muted">
            The first check saves a copy of {running === 1 ? "the page" : "each page"}. Changes show on the next check onwards.
          </p>
        )}
      </div>
    </section>
  );
}

function StepIcon({ state }: { state: SetupStep["state"] }) {
  if (state === "running") return <span className="ui-spinner shrink-0 text-accent" />;
  if (state === "off") return <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-edge" />;
  if (state === "problem") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-label="Problem"
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
    );
  }
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
      className="shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
