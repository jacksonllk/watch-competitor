<div align="center">
  <img src="public/watch-competitor-logo.png" alt="Watch Competitor logo" width="72">
  <h1>Watch Competitor</h1>
  <p><strong>Watch your competitors' pricing, launches and news, and respond with your AI agent.</strong><br>
  An open source, self-hosted alternative to Crayon, Klue and Kompyte. Free and easy to customize.</p>
  <p>
    <a href="https://watch-competitor.vercel.app">Live demo</a> ·
    <a href="#features">Features</a> ·
    <a href="#compared-with-crayon-klue-and-kompyte">Compared with Crayon, Klue and Kompyte</a> ·
    <a href="#what-it-costs">What it costs</a> ·
    <a href="#get-started">Get started</a> ·
    <a href="docs/self-hosting.md">Self-hosting guide</a>
  </p>

[![Built with context.dev](https://img.shields.io/badge/built%20with-context.dev-2563eb)](https://context.dev/?utm_source=watch-competitor&utm_medium=readme&utm_campaign=open-source)
[![MIT licence](https://img.shields.io/badge/licence-MIT-green)](LICENSE)

</div>

[![The Overview timeline, then a pricing change opened in Assess](demo/part1.gif)](https://watch-competitor.vercel.app)

Watch Competitor checks your competitors' pricing pages and changelogs every day and searches the news about them. It tells you what changed in plain words, and turns each change into a prompt your AI agent can act on. The [live demo](https://watch-competitor.vercel.app) watches E2B, Daytona and Modal. It is built on [context.dev](https://context.dev/?utm_source=watch-competitor&utm_medium=readme&utm_campaign=open-source), which checks the pages and finds the news.

## Why Watch Competitor

**Every change, in plain words.** A price that moved shows as "Hobby · 20 concurrent → Hobby · 10 concurrent". A launch shows as one line from their changelog. You read what changed, not a page diff.

**Act on a change.** Assess turns any change into a prompt for your AI agent. Tick what you need, such as an updated comparison page or talking points for sales, and copy it.

**Pay for the checks, not a subscription.** Watch Competitor is free and MIT licensed. You bring your own context.dev key, and one competitor uses about 90 credits a month. Crayon, Klue and Kompyte publish no prices: you book a demo.

**Change anything.** The prompts, the check instructions and the page types are plain files in this repo. Edit them to fit your team.

## Features

### One timeline for every competitor

The Overview puts every competitor on one timeline: pricing changes, launches and news, one dot per change. Show 7, 30, 60 or 90 days, drag back through time, or move the history window to any week the app has saved. Hover a dot to see what changed. The Feed lists the same changes week by week, newest first.

### Assess a change with your AI agent

Every change has an Assess button. The panel shows what changed, with the before and after of a price, and a prompt for your AI agent. Tick what else it should do. It can update your comparison page, write talking points for sales, draft an offer, weigh your own pricing, or write a note for the team. The prompt tells your agent to draft only and to ask before it changes anything. You edit the prompts in [`prompts/`](prompts/README.md).

### Add a competitor in a minute

[![Adding Blaxel: its pages and news, a focus, one more monitor, then Start watching](demo/part2.gif)](https://watch-competitor.vercel.app)

Type a company's name or website. Watch Competitor finds its pricing page and changelog, and shows the last 90 days of news about it. Say what matters to you, such as "Only report changes about sandboxes", and only those changes show from their changelog. Add more pages to watch: careers, customers, security, comparisons, their blog, or any address on their site. The timeline starts full: it reads the last 90 days of their changelog when you add them.

### Each competitor's page

Each competitor has a page with its changes, filtered by type, and what each check watches. Manage monitors changes an address, removes a page or adds one. A status line says when a check fails and what to do next.

### Slack alerts

With a Slack Incoming Webhook, new changes are posted to your channel in one message. You choose which ones per type: pricing, launches, news and other pages.

## Compared with Crayon, Klue and Kompyte

Crayon, Klue and Kompyte are competitive intelligence platforms for sales and marketing teams. Watch Competitor does one part of what they do: it watches competitors' pages and news, and helps you act on each change. Their features below are as their own websites described them on 11 and 12 November 2026.

| | Watch Competitor | Crayon, Klue and Kompyte |
|---|---|---|
| **Price** | Free and MIT licensed. You pay context.dev for the checks: about 90 credits per competitor a month | Not published. Each asks you to book a demo or request an estimate |
| **Where it runs** | Your own server or host, with your own keys | Their cloud |
| **Watches competitors' websites** | Pricing page, changelog and the pages you add, once a day | Yes, from many sources |
| **News** | Searched daily by the competitor's domain | Yes. Crayon summarizes articles with AI |
| **Says what changed** | Plain words, with the before and after of a price | Yes. Crayon scores importance with AI |
| **Acts on a change** | A prompt for your own AI agent | Battlecards and sales content |
| **Source code** | Open, MIT | Closed |

### Where they do more

- **Battlecards for sellers.** All three create and update battlecards for live deals.
- **Your sales tools.** Crayon connects to Salesforce, HubSpot, Slack, Microsoft Teams, Highspot and Gong. Kompyte connects to Salesforce and HubSpot.
- **Win-loss.** Klue runs win-loss programs, including buyer interviews by its own analyst team. Crayon reports win/loss analysis.
- **Many users.** Kompyte's plans come with 25, 100 or unlimited users. Crayon and Kompyte offer single sign-on.

If your sales team works from battlecards inside its CRM, those platforms are built for it. If you want to know what changed and act on it with your own agent, Watch Competitor is.

Crayon, Klue and Kompyte are trademarks of their owners. Watch Competitor is not affiliated with them. Sources: [crayon.co](https://www.crayon.co/), [crayon.co/integrations](https://www.crayon.co/integrations), [klue.com](https://klue.com/), [klue.com/pricing](https://klue.com/pricing), [kompyte.com/plans](https://www.kompyte.com/plans).

## What it costs

Watch Competitor is free. The checks run on your context.dev account, which counts them in credits:

| What | Credits |
|---|---|
| One page check (each watched page, once a day) | 1 |
| One news search (each competitor, once a day) | 1 for every 10 articles found |
| Adding a competitor: company lookup, 90 days of news, first checks, changelog history | about 5 to 10, once |
| One competitor with its pricing page and changelog, for a month | about 90 |

The monthly figure is measured: the three demo competitors used about 9 credits a day on 9 November 2026. context.dev's plans, as [its pricing page](https://www.context.dev/pricing) listed them on 11 November 2026:

| Plan | Price | Credits a month | Monitors | Competitors it covers |
|---|---|---|---|---|
| Free | $0 | 1,000 | 10 | 5, with a pricing page and changelog each. The monitors run out first |
| Developer | $20 a month | 5,000 | 100 | About 50, about $0.40 each a month |

Hosting is yours. A server with a disk needs nothing else. A host that keeps no files between requests needs an Upstash Redis database, as the [self-hosting guide](docs/self-hosting.md#where-your-data-is-kept) explains.

On the live demo, each company lookup uses 2 to 5 of our credits, and lookups stop after 15 credits a day.

## Make it yours

| To change | Edit |
|---|---|
| The Assess prompts and the tasks offered for each type of change | [`prompts/`](prompts/README.md) |
| What a pricing or changelog check reports, how often pages and news are checked, how much changelog a new competitor reads, Slack alerts | `watch-competitor.config.json`, in the [self-hosting guide](docs/self-hosting.md#settings) |
| The types of extra page (careers, customers, security, comparisons, blog) and what each check reports | [`lib/page-types.ts`](lib/page-types.ts) |
| Where the data is kept | A store with `get`, `set` and `delete` in [`lib/store/`](lib/store/). A file and Upstash Redis are included |
| Where "Contact support" links | `SUPPORT_URL` |

## Build a product on it

The MIT licence lets you run Watch Competitor for others and charge for it. Your cost per customer is in [What it costs](#what-it-costs). What it does not have yet:

- **Sign-in and accounts.** A copy has no sign-in. Everyone who opens it sees and changes the same competitors.
- **A key or metering per customer.** Every check runs on the one context.dev key the copy is given.
- **Billing.**

What already fits: the screens never name the vendor, credits or plans. When the context.dev account stops a check, the screen says "Contact support" and links to your `SUPPORT_URL`, and the cause goes to the server log.

## Get started

### Try the demo

Open [watch-competitor.vercel.app](https://watch-competitor.vercel.app). Explore the timeline and Assess, and look up any company in Add competitor. The demo does not start watching new competitors: run your own copy for that.

### Run it on your computer

You need Node.js 20.9 or later and a context.dev API key. Its free plan covers 5 competitors.

```bash
git clone https://github.com/jacksonllk/watch-competitor.git && cd watch-competitor
cp .env.example .env   # add your CONTEXT_DEV_API_KEY
npm install && npm run dev
```

The app runs at http://localhost:3000. It saves your competitors and their changes to `.data/store.json`.

### Deploy your own

Watch Competitor is a standard Next.js app. It runs on any host with Node.js 20.9 or later, or on your own server:

```bash
npm install
npm run build
npm start
```

1. Set `CONTEXT_DEV_API_KEY` to your context.dev key.
2. On a host that keeps no files between requests, set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from an Upstash Redis database. On a server with a disk, skip this.
3. Set `APP_URL` to your copy's public https address, so each finished check reaches the app at once.
4. Keep the address private, or put it behind your host's access protection. A copy has no sign-in.

The [self-hosting guide](docs/self-hosting.md) covers every setting, Slack, updates when nobody has the app open, and security.

## Built on context.dev

Watch Competitor uses these context.dev features:

- **Brand search** finds the company by its name or website, with its logo and description.
- **News search** finds articles about the company by its domain: 90 days when you add it, then once a day.
- **Monitors** check each watched page once a day. context.dev's AI judge reads each instruction, decides which differences matter, and writes the summary. A webhook sends each result to your copy as soon as the check finishes.
- **Scrape** reads the changelog once, when you add a competitor.

Watch Competitor itself finds the pricing page and changelog with plain requests to the competitor's site. It also draws the timeline, writes the Assess prompts and sends the Slack alerts.

## Limitations

- A check reads a page as it first shows. Prices behind a tab or toggle, such as annual billing or a second price table, are not watched. On a paid context.dev plan, a monitor can click the tab first. The app does not set that up yet.
- Customers pages report additions only. These pages often show only their newest case studies, so an older one hidden behind "Load more" would look removed.
- A change shows when the daily check finds it, up to a day after it happened. Pricing history starts on the day you add a competitor.
- News comes from the outlets context.dev covers. Small companies may have little or none.
- A copy has no sign-in. See [Build a product on it](#build-a-product-on-it).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
