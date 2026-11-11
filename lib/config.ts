/**
 * Optional settings file `watch-competitor.config.json` in the repo root.
 * Missing file or missing keys fall back to the defaults below. The README's Configuration section documents it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PageKind } from "./find-pages";

export type AlertLevel = "off" | "high" | "medium" | "all";
export type ScheduleUnit = "minutes" | "hours" | "days";
/** How often context.dev checks each page. Each check costs 1 credit, so once a day is 1 credit a day per page. */
export type Schedule = { every: number; unit: ScheduleUnit };
export type Config = {
  schedule: Schedule;
  /** How often the app searches each competitor's news: every 1 to 7 days. Each search costs about 1 credit. */
  news: { everyDays: number };
  /** How many days of a new competitor's changelog the app reads when it is added: 0 to 365, 0 off. 1 credit a page. */
  history: { changelogDays: number };
  /** pages: changes on extra pages (careers, customers…), which have no importance rating, so off or all. */
  alerts: { pricing: AlertLevel; changelog: AlertLevel; news: "off" | "all"; pages: "off" | "all"; muted: string[] };
  /** The base sentence sent to context.dev for each page monitor. The user's focus is added after it, except on pricing pages. */
  instructions: Record<PageKind, string>;
};

export const DEFAULT_CONFIG: Config = {
  schedule: { every: 1, unit: "days" },
  news: { everyDays: 1 },
  history: { changelogDays: 90 },
  alerts: { pricing: "all", changelog: "high", news: "all", pages: "all", muted: [] },
  instructions: {
    changelog: "Report new features and product launches. Ignore bug fixes, patch notes and dependency bumps.",
    pricing:
      "Report any change to plan names, prices, limits or what each plan includes. Report every price change, however small. Ignore wording, layout and testimonial changes.",
  },
};

export const CONFIG_FILE = "watch-competitor.config.json";

/** Merges a parsed settings file over the defaults. Ignores keys and values it does not know. */
export function mergeConfig(raw: unknown): Config {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Config, Record<string, unknown>>>;
  const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);
  const instructions = input.instructions ?? {};
  return {
    schedule: readSchedule(input.schedule),
    news: { everyDays: readNewsDays((input.news as { everyDays?: unknown } | undefined)?.everyDays) },
    history: { changelogDays: readHistoryDays((input.history as { changelogDays?: unknown } | undefined)?.changelogDays) },
    alerts: { ...DEFAULT_CONFIG.alerts, ...(input.alerts as Partial<Config["alerts"]> | undefined) },
    instructions: {
      changelog: text(instructions.changelog, DEFAULT_CONFIG.instructions.changelog),
      pricing: text(instructions.pricing, DEFAULT_CONFIG.instructions.pricing),
    },
  };
}

const UNIT_MINUTES: Record<ScheduleUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * The app's own limit: every 1 to 7 days (9 Nov, Jackson). context.dev allows 10 minutes to 1 year, but no pricing page
 * or changelog needs checking more than daily, and each check costs 1 credit. Anything else falls back to once a day.
 */
export const SCHEDULE_DAYS = { min: 1, max: 7 } as const;

export function readSchedule(raw: unknown): Schedule {
  const value = (raw ?? {}) as Partial<Schedule>;
  const every = Number(value.every);
  if (value.unit !== "days" || !Number.isInteger(every) || every < SCHEDULE_DAYS.min || every > SCHEDULE_DAYS.max) return DEFAULT_CONFIG.schedule;
  return { every, unit: "days" };
}

/** News every 1 to 7 days, the same limit as page checks. Anything else falls back to daily. */
export function readNewsDays(raw: unknown): number {
  const days = Number(raw);
  return Number.isInteger(days) && days >= SCHEDULE_DAYS.min && days <= SCHEDULE_DAYS.max ? days : 1;
}

/** Days of changelog read at Add: 0 (off) to 365. Anything else falls back to 90. */
export const HISTORY_DAYS = { max: 365 } as const;
export function readHistoryDays(raw: unknown): number {
  if (raw === undefined) return DEFAULT_CONFIG.history.changelogDays;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 0 && days <= HISTORY_DAYS.max ? days : DEFAULT_CONFIG.history.changelogDays;
}

/** Checks a day per page, for cost lines. */
export function checksPerDay(schedule: Schedule): number {
  return 1440 / (schedule.every * UNIT_MINUTES[schedule.unit]);
}

/** Reads the settings file from the working directory. A missing file gives the defaults. A broken file throws. */
export function loadConfig(dir: string = process.cwd()): Config {
  let text: string;
  try {
    text = readFileSync(join(dir, CONFIG_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
    throw error;
  }
  try {
    return mergeConfig(JSON.parse(text));
  } catch {
    throw new Error(`${CONFIG_FILE} is not valid JSON. Fix it or delete it to use the defaults.`);
  }
}
