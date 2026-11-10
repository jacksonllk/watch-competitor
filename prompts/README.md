# Assess prompts

The Assess button on every change opens a panel. The user ticks what their AI agent should do, then copies one prompt. These files decide what that prompt says. Edit them to fit your team.

| File | Used for |
|---|---|
| `pricing.txt` | Pricing changes |
| `changelog.txt` | New features from a changelog |
| `news.txt` | News and mentions |
| `tasks.json` | The tasks offered for each type, in order |

## Templates

Placeholders: `{{name}}`, `{{domain}}`, `{{type}}`, `{{detected}}`, `{{source}}`, `{{changes}}`, `{{tasks}}`.
A line is left out when one of its placeholders is empty.

`{{changes}}` is what changed, in plain words: the summary, then one line per change, such as `Team plan: $8 per seat a month -> $10 per seat a month`. It comes from the competitor's website, up to 1,500 characters. Keep it inside the `<<<` and `>>>` block with its label: that tells your agent to treat it as data, not instructions.

`{{tasks}}` must be a line of its own. It becomes the WHAT I NEED list: Assess and recommend, then each task the user ticked, in the order `tasks.json` has them. The prompt holds exactly what the panel shows.

```
WHAT I NEED
1. Assess and recommend. ...
2. Update our comparison with E2B. ...
```

## Tasks

Each type in `tasks.json` lists tasks with an `id`, a `label` and the `instruction` the agent gets. The panel shows each label after "Also ask it to", so write it as an action: "Update our comparison with {{name}}". `{{name}}` becomes the competitor's name. Give every instruction a concrete result (a diff, a word limit, a subject line), and say what to do when the task does not apply ("If not, say so and skip this").

The `assess` task ("Assess and recommend") comes first and is always in the prompt. Its `outcome` is the line under "Prompt for your AI agent" in the panel.
