<div align="center">
  <img src="public/watch-competitor-logo.png" alt="Watch Competitor logo" width="72">
  <h1>Watch Competitor</h1>
  <p><strong>Watch your competitors' pricing, launches and news, and respond with your AI agent.</strong><br>
  An open source, self-hosted alternative to Crayon, Klue and Kompyte. Free and easy to customize.</p>
  <p>
    <a href="https://watch-competitor.vercel.app">Live demo</a> ·
    <a href="#features">Features</a> ·
    <a href="#get-started">Get started</a> ·
    <a href="#build-on-it">Build on it</a>
  </p>

[![Built with context.dev](https://img.shields.io/badge/built%20with-context.dev-2563eb)](https://context.dev/?utm_source=watch-competitor&utm_medium=readme&utm_campaign=open-source)
[![MIT licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

</div>

[![The Overview timeline, then a pricing change opened in Assess](demo/part1.gif)](https://watch-competitor.vercel.app)

Watch Competitor checks your competitors' pricing pages and changelogs every day and searches the news about them. It tells you what changed in plain words and turns each change into a prompt for your AI agent. It runs on [context.dev](https://context.dev/?utm_source=watch-competitor&utm_medium=readme&utm_campaign=open-source), which checks the pages and finds the news.

It does one part of what Crayon, Klue and Kompyte do: tracking what your competitors change. It does not have the battlecards, sales tool integrations or win-loss analysis they offer.

## Features

- **One timeline.** Every competitor's pricing changes, launches and news on one timeline, from 7 to 90 days, with a weekly feed below.
- **Easy-to-read changes.** Each change comes as a short summary, or as the before and after of what changed.
- **Assess and act.** Open any change and copy a ready prompt for your AI agent. It comes with tasks that fit the change, such as updating your comparison page.
- **Focus.** Say what matters, such as "Only report changes about sandboxes", and only those changes show from their changelog. Pricing always shows in full.
- **Monitor key pages.** Add their careers, customers, security or blog page, or any page on their site.
- **Slack alerts.** New changes posted to your channel in one message.

[![Adding a competitor: its pages and news, a focus, one more page, then Start watching](demo/part2.gif)](https://watch-competitor.vercel.app)

## Get started

**Try it** on the [live demo](https://watch-competitor.vercel.app). You can look up any company, but only your own copy starts watching.

**Run it on your computer.** You need Node.js 20.9 or later and a context.dev API key. Its free plan covers 5 competitors.

```bash
git clone https://github.com/jacksonllk/watch-competitor.git && cd watch-competitor
cp .env.example .env   # add your CONTEXT_DEV_API_KEY
npm install && npm run dev
```

The app runs at http://localhost:3000 and saves its data to `.data/store.json`.

### Deploy your own

It is a standard Next.js app. It runs on any host with Node.js 20.9 or later: `npm run build`, then `npm start`.

**Database.** By default the app saves to a file, `.data/store.json`, which suits your computer or one server with a disk. On a host that keeps no files between requests, use Upstash Redis: set the two `UPSTASH_REDIS_REST_` variables below.

| Variable | What it does |
|---|---|
| `CONTEXT_DEV_API_KEY` | Required. Your context.dev key. A restricted key needs Data APIs (use) and Monitors (manage). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Your Upstash Redis database. Not needed on a server with a disk. |
| `APP_URL` | Your copy's public address. Each finished check then reaches the app at once, through a signed webhook. |
| `SLACK_WEBHOOK_URL` | A Slack Incoming Webhook. New changes are posted there. |
| `CRON_SECRET` | Lets a scheduler call `GET /api/cron` with `Authorization: Bearer <secret>`, to update when nobody has the app open. |
| `SUPPORT_URL` | Where "Contact support" links, when your context.dev account stops a check. |

A copy has no sign-in. Keep its address private, or put it behind your host's access protection.

## Credits

Every check runs on your context.dev account:

| Action | Credits |
|---|---|
| Check one page | 1 a day |
| Search one competitor's news | 1 a day for every 10 articles |
| Add a competitor | about 5 to 10, once |
| Watch one competitor's pricing page and changelog | about 90 a month |

## Build on it

**Change how it works.** These are plain files:

| To change | Edit |
|---|---|
| The Assess prompts and tasks | [`prompts/`](prompts/README.md) |
| What a check reports, how often it runs, Slack alerts | `watch-competitor.config.json` ([defaults](lib/config.ts)) |
| The extra page types and what each reports | [`lib/page-types.ts`](lib/page-types.ts) |

**Take it further.** The MIT licence lets you build on it and sell what you build. Good next steps:

- Add sign-in and accounts, so each team sees only its own competitors.
- Use another database, such as Postgres. A store is one file in [`lib/store/`](lib/store/) with `get`, `set` and `delete`.
- Give each customer their own context.dev key, or meter their usage.
- Send alerts to email or Microsoft Teams, next to Slack.

## Limitations

- Prices behind a tab or toggle, such as annual billing, are not watched. A check reads the page as it first shows.
- A change shows when the daily check finds it, up to a day later. Pricing history starts the day you add a competitor.
- Customers pages report additions only, because older case studies often hide behind "Load more".
- News comes from the outlets context.dev covers. Small companies may have little.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
