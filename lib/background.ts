/**
 * The work after each refresh: the daily news check for each competitor that is due, then Slack alerts for anything
 * new. Runs from the refresh route (the app is open), the context.dev webhook (a monitor run finished) and the cron
 * route (any scheduler with CRON_SECRET). News costs at most one search per competitor per `news.everyDays` days
 * (settings file, default 1), however often it runs.
 */
import { sendAlerts, type AlertResult } from "./alerts";
import { loadCompetitors } from "./competitors";
import { loadConfig } from "./config";
import type { ContextApi } from "./context";
import { isDemo } from "./links";
import { checkNews } from "./news";
import type { Store } from "./store/types";

type Env = Record<string, string | undefined>;
export type AfterRefresh = { newsChecked: number; alerts: AlertResult };

/** The app's public address for links in alerts, from APP_URL. Null when it is not an http(s) address. */
export function appUrl(env: Env = process.env): string | null {
  const raw = env.APP_URL?.trim();
  return raw && /^https?:\/\/[^\s]+$/.test(raw) ? raw.replace(/\/$/, "") : null;
}

let running: Promise<AfterRefresh> | null = null;

/** One run at a time per process, so two calls at once never pay for the same news search. */
export function afterRefresh(store: Store, api: ContextApi, options: { now?: Date; env?: Env } = {}): Promise<AfterRefresh> {
  running ??= run(store, api, options).finally(() => (running = null));
  return running;
}

async function run(store: Store, api: ContextApi, options: { now?: Date; env?: Env }): Promise<AfterRefresh> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const competitors = await loadCompetitors(store);
  const config = loadConfig();
  let newsChecked = 0;
  for (const c of competitors) {
    if (c.status !== "watching" || c.news === false) continue;
    try {
      if ((await checkNews(store, api.news, c, now, {}, config.news.everyDays)).checked) newsChecked++;
    } catch (error) {
      console.error("News check failed", c.slug, error);
    }
  }
  // The public demo never sends to anyone's Slack.
  const alerts = isDemo(env)
    ? ({ status: "off" } as const)
    : await sendAlerts(store, competitors, config.alerts, { webhookUrl: env.SLACK_WEBHOOK_URL?.trim() || null, appUrl: appUrl(env), now });
  return { newsChecked, alerts };
}
