/**
 * Day arithmetic and the app's date words, US style ("Nov 9", "Oct 11 – Nov 9"), for the whole app. A day is a whole UTC day, numbered from 1 Jan 1970,
 * so ranges move and compare as plain numbers. Safe on the server and in the browser.
 */
const DAY_MS = 86_400_000;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-09" -> its day number. */
export const toNum = (day: string) => Math.round(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / DAY_MS);
/** Day number -> "2026-11-09". */
export const toDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** 0 is Sunday, as Date.getUTCDay. Day 0 (1 Jan 1970) was a Thursday. */
export const weekday = (n: number) => (((n + 4) % 7) + 7) % 7;
export const dayOfMonth = (n: number) => new Date(n * DAY_MS).getUTCDate();
export const monthOf = (n: number) => new Date(n * DAY_MS).getUTCMonth();
export const yearOf = (n: number) => new Date(n * DAY_MS).getUTCFullYear();
/** The first day of the month that holds day n, moved by `add` months. */
export const monthStart = (n: number, add = 0) => {
  const d = new Date(n * DAY_MS);
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1) / DAY_MS);
};

/** The Sunday that starts the week holding day n. Weeks run Sunday to Saturday, as on US calendars. */
export const weekStart = (n: number) => n - weekday(n);

/** "Wed, Nov 4". */
export const longDay = (n: number) => `${WEEKDAYS[weekday(n)]}, ${MONTHS[monthOf(n)]} ${dayOfMonth(n)}`;

/** "Nov 9", or "Dec 28, 2025" outside the current year. */
export const shortDay = (n: number, today: number) => `${MONTHS[monthOf(n)]} ${dayOfMonth(n)}${yearOf(n) !== yearOf(today) ? `, ${yearOf(n)}` : ""}`;

/**
 * US style: "Oct 11 – Nov 9", "Nov 3–9" within a month, "Nov 9" for one day.
 * Years show when the range leaves the current year: "Dec 28, 2025 – Jan 3, 2026".
 */
export function rangeText(from: number, to: number, today: number): string {
  const withYear = yearOf(from) !== yearOf(today) || yearOf(to) !== yearOf(today);
  const part = (n: number, y: boolean) => `${MONTHS[monthOf(n)]} ${dayOfMonth(n)}${y ? `, ${yearOf(n)}` : ""}`;
  if (from === to) return part(from, withYear);
  if (monthOf(from) === monthOf(to) && yearOf(from) === yearOf(to))
    return `${MONTHS[monthOf(from)]} ${dayOfMonth(from)}–${dayOfMonth(to)}${withYear ? `, ${yearOf(to)}` : ""}`;
  return `${part(from, withYear && yearOf(from) !== yearOf(to))} – ${part(to, withYear)}`;
}

/** "1 day", "30 days". */
export const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
