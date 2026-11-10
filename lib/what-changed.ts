/**
 * What changed, in plain words. The app shows these rows and the response prompt uses the same ones,
 * so the user pastes what they see. Never a raw diff.
 */
import type { CompetitorEvent } from "./events";

export type ChangeRow =
  | { type: "changed"; label: string | null; before: string; after: string }
  | { type: "added"; text: string }
  | { type: "removed"; text: string }
  | { type: "text"; text: string };

export type WhatChanged = {
  /** context.dev's summary of the change. Always shown first. */
  summary: string;
  /** Empty when the change cannot be read into rows. Then the summary stands alone. */
  rows: ChangeRow[];
};

/** With more rows than this, show the summary only. */
export const MAX_ROWS = 8;
/** Old and new values are shown only when both are shorter than this. */
export const SHORT_VALUE_LIMIT = 80;

/** One line, so text from a competitor cannot start a new section of the prompt. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Longest row text. A diff line can hold 2,000 characters. */
export const ROW_TEXT_LIMIT = 200;
/** A label is the text before the first colon, such as "Team" in "Team: $8 per seat". */
const LABEL = /^([^:]{1,40}):\s*(.+)$/;

function clip(text: string): string {
  return text.length <= ROW_TEXT_LIMIT ? text : `${text.slice(0, ROW_TEXT_LIMIT - 1)}…`;
}

function shortPair(before: string | null, after: string | null) {
  const [b, a] = [oneLine(before ?? ""), oneLine(after ?? "")];
  if (!b || !a || b.length >= SHORT_VALUE_LIMIT || a.length >= SHORT_VALUE_LIMIT) return null;
  return { before: b, after: a };
}

/**
 * Page text arrives with table cells glued together: "sandboxes20 concurrent", "concurrentIncludedPro", "/moPro".
 * Splits a line into its cells at those joins, drops a list marker and a cell repeated right after itself.
 * A join needs 4 lowercase letters before it, so names like GitHub, JavaScript and gpt4o stay whole.
 */
export function cells(line: string): string[] {
  const text = line.replace(/^[-*•]\s+/, "");
  const parts = text
    .split(/(?<=[a-z]{4})(?=[A-Z][a-z]|\d|\+?[$€£])|(?<=\/(?:mo|yr|month|year))(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase());
}

const words = (line: string) => new Set<string>(line.toLowerCase().match(/[a-z0-9$€£.,+]+/g) ?? []);
function similarity(a: string, b: string): number {
  const [x, y] = [words(a), words(b)];
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.max(1, new Set([...x, ...y]).size);
}

/** The cells that differ between an old and a new line, with the cells both share left out. */
function difference(before: string, after: string): { before: string; after: string } {
  const [a, b] = [cells(before), cells(after)];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return { before: a.slice(start, a.length - end).join(" · "), after: b.slice(start, b.length - end).join(" · ") };
}

/** "20 -> 10": the numbers that left and the numbers that came, to spot one change the page shows twice. */
function numberChange(row: { before: string; after: string }): string {
  const nums = (t: string): string[] => t.match(/\d[\d,.]*/g) ?? [];
  const [b, a] = [nums(row.before), nums(row.after)];
  return `${b.filter((n) => !a.includes(n)).join(",")}->${a.filter((n) => !b.includes(n)).join(",")}`;
}
const names = (text: string) => (text.match(/\b[A-Z][a-z]+/g) ?? []).length;

/**
 * Reads a context.dev diff into rows. The documented format: changed lines, each starting with + or -.
 * - A removed and an added line with the same label become one Changed row: "Team: $8 -> $10".
 * - Other removed lines pair with their most similar added line (or the only one), shown as the cells that differ.
 * - A page that shows one change twice (a plan card and a summary bar) gives one row: the one that names more.
 * - Other added lines become New rows, other removed lines Removed rows.
 * Lines without + or - are ignored. Identical old and new lines are dropped.
 */
export function readDiff(diff: string): ChangeRow[] {
  const removed: string[] = [];
  const added: string[] = [];
  for (const raw of diff.split("\n")) {
    const sign = raw[0];
    const text = oneLine(raw.slice(1));
    if (!text || (sign !== "+" && sign !== "-")) continue;
    (sign === "+" ? added : removed).push(text);
  }

  const changed: Extract<ChangeRow, { type: "changed" }>[] = [];
  const usedAdded = new Set<number>();
  const leftRemoved: string[] = [];

  for (const old of removed) {
    const label = old.match(LABEL);
    const match = label ? added.findIndex((a, i) => !usedAdded.has(i) && a.match(LABEL)?.[1].toLowerCase() === label[1].toLowerCase()) : -1;
    if (label && match >= 0) {
      usedAdded.add(match);
      const after = added[match].match(LABEL)![2];
      if (after !== label[2]) changed.push({ type: "changed", label: clip(label[1]), before: clip(label[2]), after: clip(after) });
    } else {
      leftRemoved.push(old);
    }
  }

  const unpaired: string[] = [];
  const onlyPair = leftRemoved.length === 1 && added.length - usedAdded.size === 1;
  for (const old of leftRemoved) {
    let best = -1;
    let score = 0;
    added.forEach((a, i) => {
      if (usedAdded.has(i)) return;
      const sim = onlyPair ? 1 : similarity(old, a);
      if (sim > score) [best, score] = [i, sim];
    });
    if (best < 0 || score < 0.5) {
      unpaired.push(old);
      continue;
    }
    usedAdded.add(best);
    if (old === added[best]) continue;
    const d = difference(old, added[best]);
    if (d.before && d.after) changed.push({ type: "changed", label: null, before: clip(d.before), after: clip(d.after) });
    else if (d.after) added.push(d.after);
    else if (d.before) unpaired.push(d.before);
  }

  // One change shown twice on the page: keep the row that names more (a plan name), the first on a tie.
  const kept: typeof changed = [];
  for (const row of changed) {
    const twin = row.label ? -1 : kept.findIndex((k) => !k.label && numberChange(k) === numberChange(row) && numberChange(row) !== "->");
    if (twin < 0) kept.push(row);
    else if (names(row.before) > names(kept[twin].before)) kept[twin] = row;
  }

  const clean = (text: string) => clip(cells(text).join(" · "));
  return [
    ...kept,
    ...added.filter((_, i) => !usedAdded.has(i)).map((text) => ({ type: "added" as const, text: clean(text) })),
    ...unpaired.map((text) => ({ type: "removed" as const, text: clean(text) })),
  ];
}

/**
 * Pricing and changelog: rows read from the diff. When that gives none, one old -> new row from the
 * short before and after values. News: the article text.
 * More than MAX_ROWS rows: none, so the summary stands alone.
 */
export function whatChanged(event: CompetitorEvent): WhatChanged {
  const summary = oneLine(event.summary);
  let rows: ChangeRow[] = [];

  if (event.kind === "news") {
    const text = oneLine(event.excerpt ?? "");
    if (text) rows = [{ type: "text", text: clip(text) }];
  } else {
    rows = event.diff ? readDiff(event.diff) : [];
    const pair = rows.length ? null : shortPair(event.before, event.after);
    if (pair) rows = [{ type: "changed", label: null, ...pair }];
  }

  return { summary, rows: rows.length > MAX_ROWS ? [] : rows };
}

/** A row as one line of plain text, for the prompt. */
export function rowText(row: ChangeRow): string {
  switch (row.type) {
    case "changed":
      return `${row.label ? `${row.label}: ` : ""}${row.before} -> ${row.after}`;
    case "added":
      return `New: ${row.text}`;
    case "removed":
      return `Removed: ${row.text}`;
    case "text":
      return row.text;
  }
}
