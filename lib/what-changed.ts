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
 * Reads a context.dev diff into rows. The documented format: changed lines, each starting with + or -.
 * - A removed and an added line with the same label become one Changed row: "Team: $8 -> $10".
 * - Exactly one removed and one added line, with no label match, also become one Changed row.
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

  const rows: ChangeRow[] = [];
  const usedAdded = new Set<number>();
  const leftRemoved: string[] = [];

  for (const old of removed) {
    const label = old.match(LABEL);
    const match = label
      ? added.findIndex((a, i) => !usedAdded.has(i) && a.match(LABEL)?.[1].toLowerCase() === label[1].toLowerCase())
      : -1;
    if (label && match >= 0) {
      usedAdded.add(match);
      const after = added[match].match(LABEL)![2];
      if (after !== label[2]) rows.push({ type: "changed", label: clip(label[1]), before: clip(label[2]), after: clip(after) });
    } else {
      leftRemoved.push(old);
    }
  }
  const leftAdded = added.filter((_, i) => !usedAdded.has(i));

  if (leftRemoved.length === 1 && leftAdded.length === 1) {
    if (leftRemoved[0] !== leftAdded[0]) {
      rows.push({ type: "changed", label: null, before: clip(leftRemoved[0]), after: clip(leftAdded[0]) });
    }
  } else {
    rows.push(...leftAdded.map((text) => ({ type: "added" as const, text: clip(text) })));
    rows.push(...leftRemoved.map((text) => ({ type: "removed" as const, text: clip(text) })));
  }
  return rows;
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
