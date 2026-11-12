# Self-hosting Watch Competitor

Everything about running your own copy: deploying it, where it keeps its data, every setting, updates in real time and on a schedule, Slack, and security. The [README](../README.md) has the short version.

- [Deploying](#deploying)
- [Where your data is kept](#where-your-data-is-kept)
- [Environment variables](#environment-variables)
- [Settings](#settings)
- [Changes the moment a check finishes](#changes-the-moment-a-check-finishes)
- [Updates when nobody has the app open](#updates-when-nobody-has-the-app-open)
- [Slack alerts](#slack-alerts)
- ["Contact support"](#contact-support)
- [A public demo copy](#a-public-demo-copy)
- [Removing a competitor](#removing-a-competitor)
- [Checking your monitors](#checking-your-monitors)
- [Security notes](#security-notes)

## Deploying

Watch Competitor is a standard Next.js app. It runs on any host with Node.js 20.9 or later, or on your own server:

```bash
npm install
npm run build
npm start
```

1. Set `CONTEXT_DEV_API_KEY` to your context.dev API key. A restricted key needs Data APIs (use) and Monitors (manage).
2. Choose where the app keeps its data, as the next section says.
3. Set `APP_URL` to your copy's public https address.
4. Open the app and add your first competitor.

Without a key, the app shows one setup step: "Add your context.dev API key to .env as CONTEXT_DEV_API_KEY, then restart the app."

## Where your data is kept

The app keeps your competitors, their changes, their news and the monitors' webhook secrets in one store.

- **A server with a disk:** nothing to set. The app saves to `.data/store.json`. Back up that file.
- **A host that keeps no files between requests** (serverless): set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an Upstash Redis database. Some hosts' Upstash integrations set `KV_REST_API_URL` and `KV_REST_API_TOKEN` instead. Both work. On Vercel without them, the app shows one setup step: "Connect a store".
- **Another database:** write a store with `get`, `set` and `delete` in [`lib/store/`](../lib/store/), next to the file and Upstash stores, and run the shared store tests. Every key the app writes starts with `competitor-watch:`, so one database can serve other apps too.

## Environment variables

Copy `.env.example` to `.env`. Only `CONTEXT_DEV_API_KEY` is required.

| Variable | What it does | Default |
|---|---|---|
| `CONTEXT_DEV_API_KEY` | Your context.dev API key. It runs the page checks, news searches and company lookups. | Required |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | An Upstash Redis database for the store, on hosts that keep no files. | Not set: `.data/store.json` |
| `APP_URL` | Your copy's public https address. Used for real-time updates and for links in Slack messages. | Not set: the app reads results itself when a check is due |
| `SLACK_WEBHOOK_URL` | A Slack Incoming Webhook URL. New changes are posted to its channel. | Not set: no alerts |
| `CRON_SECRET` | A long random string that lets a scheduler call `GET /api/cron`. | Not set: the route is off |
| `SUPPORT_URL` | Where "Contact support" links: a web page or an email address. | Not set: the words show with no link |
| `PREVIEW_DAILY_CREDIT_CAP` | The most credits company searches and lookups in the Add panel may use in a day. | 15 |

## Settings

`watch-competitor.config.json` in the repo root holds the settings that are not secrets. The file is optional. A missing key keeps its default. These are the defaults:

```json
{
  "schedule": { "every": 1, "unit": "days" },
  "instructions": {
    "changelog": "Report new features and product launches. Ignore bug fixes, patch notes and dependency bumps. Ignore list numbering and entries moving down the page.",
    "pricing": "Report any change to plan names, prices, limits or what each plan includes. Report every price change, however small. Ignore wording, layout and testimonial changes."
  },
  "news": { "everyDays": 1 },
  "history": { "changelogDays": 90 },
  "alerts": { "pricing": "all", "changelog": "high", "news": "all", "pages": "all", "muted": [] }
}
```

| Key | What it changes |
|---|---|
| `schedule` | How often context.dev checks each watched page: every 1 to 7 days. Anything else falls back to once a day. Each check uses 1 credit. |
| `instructions` | The sentence context.dev's AI judge reads to decide which differences on a pricing page or changelog matter. A competitor's focus ("What matters to you?") is added after the changelog sentence, never after the pricing one. |
| `news.everyDays` | How often each competitor's news is searched: every 1 to 7 days. |
| `history.changelogDays` | How many days of a new competitor's changelog the app reads when you add it: 0 to 365, `0` turns it off. It reads up to 3 pages of a changelog split into pages, 1 credit each. |
| `alerts` | Which changes go to Slack, per type: `off`, `high`, `medium` or `all`. News and other pages take `off` or `all`. `muted` lists competitors to leave out, by their slug. |

- A new `schedule` reaches every monitor the next time the app reads from context.dev. That is free, and each monitor keeps the page copy it compares against.
- New `instructions` apply to competitors you add afterwards. Changing an existing monitor's instruction makes context.dev save a fresh copy of the page (1 credit) and report nothing on that check, so the app never does it for you.
- Keep the "Ignore …" part of each instruction. It keeps typo, layout and testimonial changes out of your timeline.
- When you change an instruction, the Add panel and Manage monitors show your instruction instead of the built-in description.
- The extra page types (careers, customers, security, comparisons, blog, other) keep their instructions in [`lib/page-types.ts`](../lib/page-types.ts).
- The Assess prompts and tasks live in [`prompts/`](../prompts/README.md).

## Changes the moment a check finishes

With `APP_URL` set to a public https address, the app adds a webhook to each monitor on its next read. Adding it is free. context.dev then sends a signed event to `/api/webhooks/context-dev` as soon as a check finishes, and the change shows within seconds. The app checks each signature and ignores repeats.

Without a public address, such as on your computer, the app reads results itself when a check is due, while the app is open.

## Updates when nobody has the app open

The app saves new changes, runs the daily news search and sends Slack alerts when someone opens it or a webhook arrives. To do that on a schedule instead, set `CRON_SECRET` and have any scheduler call the cron route:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron"
```

Once an hour is plenty: pages are checked once a day. Without `CRON_SECRET` the route answers 404, and with a wrong secret it answers 401.

## Slack alerts

1. In Slack, create an Incoming Webhook for the channel you want.
2. Set `SLACK_WEBHOOK_URL` to its URL.
3. Choose which changes to send with `alerts` in the settings file.

New changes are posted in one message after each update. With `APP_URL` set, each change links to its competitor's page.

## "Contact support"

When your context.dev account stops a check, for example when it is out of credits, the screen names the check that failed and says "Contact support". It never shows the vendor, credits or plans. The cause is written to the server log. Set `SUPPORT_URL` to a web page or an email address, and "Contact support" links to it.

## A public demo copy

`DEMO_MODE=true` turns a copy into a read-only demo, like [watch-competitor.vercel.app](https://watch-competitor.vercel.app). Visitors can look up any company in the Add panel, but Start watching shows how to run their own copy instead. Check now, Remove, Manage monitors and Delete history do not change anything. Company lookups still use your key, up to `PREVIEW_DAILY_CREDIT_CAP` credits a day.

## Removing a competitor

Remove, on a competitor's page, deletes its monitors in context.dev and keeps every change already saved. The competitor shows as "No longer watched". Delete history then removes it and everything saved about it.

## Checking your monitors

```bash
npm run monitors
```

It lists this app's monitors in context.dev with their status, last and next check, and webhook. It reads only, uses no credits and prints no secrets.

## Security notes

- **No sign-in.** Everyone who can open your copy sees the same competitors and can add or remove them, which spends your credits. Keep the address private, or put the app behind your host's access protection.
- **Keys stay on the server.** The context.dev key and the store credentials are read on the server only. Never commit `.env`: only `.env.example`, with empty values, is in the repo.
- **Webhooks are signed.** Each monitor has its own signing secret, kept in your store. The app rejects events whose signature does not match.
- **Competitor text is data.** What changed on a competitor's page goes into the Assess prompt inside a marked block, with a line telling your agent to treat it as data and not to follow instructions in it.
