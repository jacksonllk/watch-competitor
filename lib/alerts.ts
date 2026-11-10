/**
 * Slack alerts for new changes. Plug in a Slack Incoming Webhook URL as SLACK_WEBHOOK_URL and they are on.
 * After the app saves new changes (a monitor run, the daily news check), it posts them in one message.
 * Each change is posted once. Nothing from before alerts were turned on is posted.
 * Which changes alert comes from the `alerts` settings in competitor-watch.config.json. Extend sendAlerts to add channels.
 */
import type { CompetitorRecord } from "./competitors";
import type { Config } from "./config";
import type { CompetitorEvent } from "./events";
import { loadEvents } from "./overview";
import type { Store } from "./store/types";
import { whatChanged } from "./what-changed";

export const ALERTS_SINCE = "alerts:since";
export const ALERTS_SENT = "alerts:sent";
/** Most changes listed in one message. The rest are counted, with a link to the app. */
export const MAX_ITEMS = 8;
/** How many sent ids to remember, so a change is never posted twice. */
const REMEMBER = 1000;

const TYPE = { pricing: "Pricing", changelog: "Feature", news: "News", page: "Page" } as const;

/** Whether a change passes the alert settings: its type's level, and its competitor not muted. */
export function passes(event: CompetitorEvent, alerts: Config["alerts"]): boolean {
  if (alerts.muted.includes(event.competitor.slug)) return false;
  if (event.kind === "news") return alerts.news === "all";
  if (event.kind === "page") return alerts.pages !== "off";
  const level = alerts[event.kind];
  if (level === "off") return false;
  if (level === "all") return true;
  if (level === "medium") return event.importance === "medium" || event.importance === "high";
  return event.importance === "high";
}

/** Slack's three special characters in competitor text. */
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The one line under a change's title: old -> new for a price change, the source for news, else the summary. */
function detail(event: CompetitorEvent): string {
  if (event.kind === "news") {
    try {
      return new URL(event.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  const { summary, rows } = whatChanged(event);
  const changed = rows.find((r) => r.type === "changed");
  const text = changed && changed.type === "changed" ? `${changed.before} → ${changed.after}` : summary;
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/** The Slack message for a set of new changes, newest first. Links go to the app when APP_URL is set. */
export function slackMessage(events: CompetitorEvent[], appUrl: string | null): { text: string } {
  const shown = events.slice(0, MAX_ITEMS);
  const link = (e: CompetitorEvent) => (appUrl ? `${appUrl.replace(/\/$/, "")}/c/${e.competitor.slug}` : e.url);
  const lines = [`*Competitor Watch* · ${events.length} new ${events.length === 1 ? "change" : "changes"}`];
  for (const e of shown) {
    lines.push(`• *${escape(e.competitor.name)}* · ${e.label ?? TYPE[e.kind]} · <${link(e)}|${escape(e.title)}>`);
    const more = detail(e);
    if (more) lines.push(`   ${escape(more)}`);
  }
  if (events.length > shown.length) {
    const rest = events.length - shown.length;
    lines.push(appUrl ? `+${rest} more in <${appUrl}|Competitor Watch>` : `+${rest} more in Competitor Watch`);
  }
  return { text: lines.join("\n") };
}

export type AlertResult =
  { status: "off" } | { status: "started" } | { status: "nothing_new" } | { status: "sent"; count: number } | { status: "failed" };

/**
 * Posts the changes saved since the last message. The first run only records the time, so nothing old is posted.
 * A change is marked sent only after Slack answers ok, so a failed post is tried again next time.
 */
export async function sendAlerts(
  store: Store,
  competitors: CompetitorRecord[],
  alerts: Config["alerts"],
  options: { webhookUrl?: string | null; appUrl?: string | null; now?: Date; post?: (url: string, body: string) => Promise<boolean> } = {},
): Promise<AlertResult> {
  if (!options.webhookUrl) return { status: "off" };
  const now = options.now ?? new Date();
  const since = await store.get<string>(ALERTS_SINCE);
  if (!since) {
    await store.set(ALERTS_SINCE, now.toISOString());
    return { status: "started" };
  }
  const sent = new Set((await store.get<string[]>(ALERTS_SENT)) ?? []);
  const watching = competitors.filter((c) => c.status === "watching");
  const events = (await Promise.all(watching.map((c) => loadEvents(store, c))))
    .flat()
    .filter((e) => e.detectedAt >= since && !sent.has(e.id) && passes(e, alerts))
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  if (!events.length) return { status: "nothing_new" };

  const post = options.post ?? postToSlack;
  const ok = await post(options.webhookUrl, JSON.stringify(slackMessage(events, options.appUrl ?? null)));
  if (!ok) return { status: "failed" };
  await store.set(ALERTS_SENT, [...events.map((e) => e.id), ...sent].slice(0, REMEMBER));
  return { status: "sent", count: events.length };
}

async function postToSlack(url: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
    return res.ok;
  } catch {
    return false;
  }
}
