"use client";

/**
 * The monitors' health as a status pill, the way status pages say it: a coloured dot and one plain sentence
 * ("All monitors working"). Hover shows every competitor's monitors at once. Each row opens that competitor's page,
 * where its monitors are. News is not a monitor (it is the app's own search), so a broken news search
 * gets its own pill, with the same kind of card listing the competitors whose search failed.
 */
import Link from "next/link";
import { KIND_NAME } from "./colors";
import { HoverCard } from "./hover-card";
import { CompanyMark } from "./mark";
import { Pill, STATE_COLOR } from "./strip";

type State = keyof typeof STATE_COLOR;
export type MonitorGroup = {
  slug: string;
  name: string;
  logo: string | null;
  colorIndex: number;
  watches: { kind: keyof typeof KIND_NAME; label: string; state: State; detail: string }[];
};

export function MonitorsStatus({ groups, newsEveryDays = 1 }: { groups: MonitorGroup[]; newsEveryDays?: number }) {
  const pages = groups.flatMap((g) => g.watches).filter((w) => w.kind !== "news");
  const count = (s: State) => pages.filter((w) => w.state === s).length;
  const total = pages.length;
  const broken = count("not_working");
  const plural = (n: number) => (n === 1 ? "monitor" : "monitors");
  const [state, text]: [State, string] =
    total === 0
      ? ["unknown", "No page monitors"]
      : broken > 0
        ? ["not_working", `${broken} of ${total} ${plural(total)} not working`]
        : count("unknown") > 0
          ? ["unknown", "Checking monitors"]
          : count("setting_up") > 0
            ? ["setting_up", `${count("setting_up")} ${plural(count("setting_up"))} setting up`]
            : ["working", total === 1 ? "Monitor working" : "All monitors working"];
  const newsGroups = groups.filter((g) => g.watches.some((w) => w.kind === "news" && w.state === "not_working"));
  const newsBroken = newsGroups.length;
  const often = newsEveryDays === 1 ? "daily" : `every ${newsEveryDays} days`;
  // Competitors that need attention come first.
  const rank = (g: MonitorGroup) => (g.watches.some((w) => w.state === "not_working") ? 0 : g.watches.some((w) => w.state !== "working") ? 1 : 2);
  const ordered = [...groups].sort((a, b) => rank(a) - rank(b));

  const card = (
    <div>
      <p className="text-body flex items-center gap-2 font-semibold text-ink">
        <span aria-hidden className="size-2 rounded-full" style={{ background: STATE_COLOR[state] }} />
        {text}
      </p>
      <p className="text-small mt-0.5 text-muted">
        {count("working")} of {total} page {plural(total)} working. News is searched {often}.
      </p>
      <CompetitorList groups={ordered} problems={(w) => w.state === "not_working"} />
    </div>
  );

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <HoverCard card={card} interactive width={380}>
        <button type="button" aria-label={`${text}. Show monitors`} className="cursor-pointer rounded-full hover:[&>span]:border-edge">
          <Pill color={STATE_COLOR[state]} warn={state === "not_working"}>
            {text}
          </Pill>
        </button>
      </HoverCard>
      {newsBroken > 0 && (
        <HoverCard
          interactive
          width={380}
          card={
            <div>
              <p className="text-body flex items-center gap-2 font-semibold text-ink">
                <span aria-hidden className="size-2 rounded-full" style={{ background: STATE_COLOR.not_working }} />
                News search not working
              </p>
              <p className="text-small mt-0.5 text-muted">
                The {often} news search failed for {newsBroken} of {groups.length} {groups.length === 1 ? "competitor" : "competitors"}.
              </p>
              <CompetitorList groups={newsGroups} problems={(w) => w.kind === "news" && w.state === "not_working"} />
            </div>
          }
        >
          <button type="button" aria-label="News search not working. Show why" className="cursor-pointer rounded-full hover:[&>span]:border-edge">
            <Pill color={STATE_COLOR.not_working} warn>
              News search not working
            </Pill>
          </button>
        </HoverCard>
      )}
    </span>
  );
}

/** Each competitor with its monitors' dots, and a line for each problem. A row opens that competitor's page. */
function CompetitorList({ groups, problems }: { groups: MonitorGroup[]; problems: (w: MonitorGroup["watches"][number]) => boolean }) {
  return (
    <ul className="-mx-1.5 mt-2.5 flex flex-col border-t border-rule pt-1.5">
      {groups.map((g) => (
        <li key={g.slug}>
          <Link href={`/c/${g.slug}`} className="group flex flex-col gap-1 rounded-[6px] px-1.5 py-2 hover:bg-panel-2">
            <span className="flex items-center gap-2.5">
              <CompanyMark name={g.name} logo={g.logo} colorIndex={g.colorIndex} size={16} />
              <span className="text-body truncate font-semibold text-ink">{g.name}</span>
              <span className="ml-auto flex items-center gap-2.5">
                {g.watches.map((w) => (
                  <span key={`${w.kind}-${w.label}`} title={w.detail} className="text-small flex items-center gap-1 text-muted">
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: STATE_COLOR[w.state] }} />
                    {w.label}
                  </span>
                ))}
                <Chevron />
              </span>
            </span>
            {g.watches.filter(problems).map((w) => (
              <span key={`${w.kind}-${w.label}`} className="text-small pl-[26px] text-warn">
                {w.detail}
              </span>
            ))}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-muted group-hover:text-ink"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
