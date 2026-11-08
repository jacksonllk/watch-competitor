/**
 * Builds the response prompt the user pastes into their AI agent.
 * Pure: no LLM call, no credits, no file reads. Templates come from prompts/ via loadTemplates().
 */
import type { CompetitorEvent, EventKind } from "./events";
import { oneLine, rowText, whatChanged } from "./what-changed";

export type Templates = Record<EventKind, string>;

export const TYPE_LABEL: Record<EventKind, string> = {
  pricing: "Pricing change",
  changelog: "New feature",
  news: "News",
};

/** Most characters of competitor text in the prompt. */
export const CHANGES_LIMIT = 1500;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * The text inside the untrusted block: the summary, then one line per row.
 * Every line is a single line, and runs of three or more < or > are shortened to two,
 * so competitor text cannot close the block or start a new section. Cut at CHANGES_LIMIT characters.
 */
export function changesBlock(event: CompetitorEvent): string {
  const { summary, rows } = whatChanged(event);
  const lines = [`Summary: ${summary || "(none)"}`, ...rows.map(rowText)].map((line) =>
    oneLine(line).replace(/<{3,}/g, "<<").replace(/>{3,}/g, ">>"),
  );
  const text = lines.join("\n");
  if (text.length <= CHANGES_LIMIT) return text;
  return `${text.slice(0, CHANGES_LIMIT)}\n[cut at ${CHANGES_LIMIT.toLocaleString("en-US")} characters]`;
}

export function buildPrompt(event: CompetitorEvent, templates: Templates): string {
  const values: Record<string, string> = {
    name: oneLine(event.competitor.name),
    domain: oneLine(event.competitor.domain),
    type: TYPE_LABEL[event.kind],
    detected: event.detectedAt.slice(0, 10),
    source: oneLine(event.url),
    changes: changesBlock(event),
  };

  return templates[event.kind]
    .split("\n")
    .flatMap((line) => {
      const names = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
      // Leave out a line whose placeholder is empty.
      if (names.some((name) => values[name] === "")) return [];
      // One pass with a callback: placeholders inside filled-in text are never expanded.
      return [line.replace(PLACEHOLDER, (match, name: string) => values[name] ?? match)];
    })
    .join("\n");
}
