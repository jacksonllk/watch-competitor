import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task, Tasks, Templates } from "./prompt";

/** Reads the editable templates from prompts/<kind>.txt. */
export function loadTemplates(dir = join(process.cwd(), "prompts")): Templates {
  const read = (kind: string) => readFileSync(join(dir, `${kind}.txt`), "utf8");
  return { pricing: read("pricing"), changelog: read("changelog"), news: read("news") };
}

const isTask = (t: unknown): t is Task =>
  typeof t === "object" &&
  t !== null &&
  ["id", "label", "instruction"].every((k) => typeof (t as Record<string, unknown>)[k] === "string") &&
  ["undefined", "string"].includes(typeof (t as Record<string, unknown>).outcome);

/**
 * Reads the tasks offered in the Assess panel from prompts/tasks.json. Each event type needs an "assess" task.
 * A type whose list is missing or broken gets no extra tasks, never a crash.
 */
export function loadTasks(dir = join(process.cwd(), "prompts")): Tasks {
  const raw = JSON.parse(readFileSync(join(dir, "tasks.json"), "utf8")) as Record<string, unknown>;
  const read = (kind: string): Task[] => {
    const list = Array.isArray(raw[kind]) ? (raw[kind] as unknown[]).filter(isTask) : [];
    return list.some((t) => t.id === "assess")
      ? list
      : [{ id: "assess", label: "Assess and recommend", instruction: "Say what it means for us and recommend what to do." }, ...list];
  };
  return { pricing: read("pricing"), changelog: read("changelog"), news: read("news") };
}
