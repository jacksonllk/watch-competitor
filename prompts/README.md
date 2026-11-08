# Response prompts

The Respond button fills one of these templates and copies the result. Edit them to change what your AI agent is asked to do.

| File | Used for |
|---|---|
| `pricing.txt` | Pricing changes |
| `changelog.txt` | New features from a changelog |
| `news.txt` | News and mentions |

Placeholders: `{{name}}`, `{{domain}}`, `{{type}}`, `{{detected}}`, `{{source}}`, `{{changes}}`.
A line is left out when one of its placeholders is empty.

`{{changes}}` is what changed, in plain words: the summary, then one line per change, such as `Team plan: $8 per seat a month -> $10 per seat a month`. It comes from the competitor's website, up to 1,500 characters. Keep it inside the `<<<` and `>>>` block with its label: that tells your agent to treat it as data, not instructions.
