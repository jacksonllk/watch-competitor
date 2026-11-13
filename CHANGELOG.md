# Changelog

## v0.1.0 (13 Nov 2026)

First public release.

- **Add a competitor.** Search by name or domain. The app finds their pricing page and changelog, shows their recent news, and starts a daily check on each. You can narrow what gets reported with a focus, such as "Only report changes about sandboxes".
- **Extra pages.** Watch their careers, customers, security, comparison or blog page, or any other page on their site.
- **Changelog history.** When you add a competitor, the app reads the last 90 days of their changelog, so the timeline does not start empty.
- **Overview.** See every competitor's pricing changes, feature launches and news on one timeline, from the last 7 days to the last 90. It opens on the last 30 days. A feed lists each change below it.
- **Assess.** Turn any change into a prompt for your AI agent, with tasks that fit the change. The prompts and tasks are plain files in `prompts/`.
- **Slack alerts.** New changes are posted to your Slack channel in one message.
- **Settings.** `watch-competitor.config.json` sets what each check reports, how often it runs, and which changes alert.
- **Storage.** Data is saved to a local file by default, or to Upstash Redis.
