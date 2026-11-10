/**
 * Builds the Assess prompt the user pastes into their AI agent.
 * Pure: no LLM call, no credits, no file reads. Templates and tasks come from prompts/ via loadTemplates() and loadTasks().
 * The template's {{tasks}} line becomes WHAT I NEED: Assess and recommend, then each task the user ticked.
 * The prompt holds exactly what the panel shows, nothing more.
 */
import type { CompetitorEvent, EventKind } from "./events";
import { oneLine, rowText, whatChanged } from "./what-changed";

export type Templates = Record<EventKind, string>;

/** One thing the user can ask their agent to do about a change. `{{name}}` becomes the competitor's name. */
export type Task = {
  id: string;
  /** Shown in the panel and used as the task's name in the prompt. Reads after "Also ask it to". */
  label: string;
  /** Assess only: the one line the panel shows to say what the prompt always asks. */
  outcome?: string;
  instruction: string;
};
export type Tasks = Record<EventKind, Task[]>;
/** The task every prompt starts with. */
export const ASSESS = "assess";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 9, 2026": the app's date style, with the year, since a prompt is read out of context. UTC. */
function usDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** The prompt around its tasks: everything before the {{tasks}} line, and everything after it. */
export type Frame = { before: string; after: string };

export function buildFrame(event: CompetitorEvent, templates: Templates): Frame {
  const values: Record<string, string> = {
    name: oneLine(event.competitor.name),
    domain: oneLine(event.competitor.domain),
    type: TYPE_LABEL[event.kind],
    detected: usDate(event.detectedAt),
    source: oneLine(event.url),
    changes: changesBlock(event),
  };
  const lines = templates[event.kind].split("\n");
  // Split at the template's own {{tasks}} line, before any competitor text goes in, so their text can never reach it.
  const at = lines.findIndex((line) => line.trim() === "{{tasks}}");
  const fill = (part: string[]) =>
    part
      .flatMap((line) => {
        const names = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
        // Leave out a line whose placeholder is empty.
        if (names.some((name) => values[name] === "")) return [];
        // One pass with a callback: placeholders inside filled-in text are never expanded.
        return [line.replace(PLACEHOLDER, (match, name: string) => values[name] ?? match)];
      })
      .join("\n");
  return at < 0 ? { before: fill(lines), after: "" } : { before: fill(lines.slice(0, at)), after: fill(lines.slice(at + 1)) };
}

/** A task with the competitor's name filled in. */
export function nameTask(task: Task, name: string): Task {
  const fill = (text: string) => text.replaceAll("{{name}}", oneLine(name));
  return { ...task, label: fill(task.label), outcome: task.outcome && fill(task.outcome), instruction: fill(task.instruction) };
}

/** The tasks section: Assess and recommend, then each ticked task, in the order the task list has them. */
export function renderTasks(tasks: Task[], chosen: Iterable<string>): string {
  const picked = new Set([ASSESS, ...chosen]);
  return ["WHAT I NEED", ...tasks.filter((t) => picked.has(t.id)).map((t, i) => `${i + 1}. ${t.label}. ${t.instruction}`)].join("\n");
}

/** The whole prompt for a change, with the chosen tasks (Assess is always in). */
export function buildPrompt(event: CompetitorEvent, templates: Templates, tasks: Tasks, chosen: Iterable<string> = []): string {
  const frame = buildFrame(event, templates);
  const list = tasks[event.kind].map((t) => nameTask(t, event.competitor.name));
  return joinPrompt(frame, renderTasks(list, chosen));
}

export function joinPrompt(frame: Frame, tasks: string): string {
  return frame.after ? `${frame.before}\n${tasks}\n${frame.after}` : `${frame.before}\n\n${tasks}`;
}
