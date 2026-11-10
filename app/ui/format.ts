import { rangeText, shortDay, toNum } from "./time";

const todayNum = () => toNum(new Date().toISOString());

/** A week from its first day: "Nov 8–14", or "Nov 29 – Dec 5" across months. UTC. */
export function weekLabel(start: string): string {
  return rangeText(toNum(start), toNum(start) + 6, todayNum());
}

/** ISO time -> "Nov 6", or "Nov 6, 2025" outside the current year. UTC. */
export function shortDate(iso: string): string {
  return shortDay(toNum(iso), todayNum());
}

/** ISO time -> "Nov 6, 9:04 AM UTC". */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  return `${shortDate(iso)}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} UTC`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "https://www.e2b.dev/pricing/" -> "e2b.dev/pricing". */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** "2 hours ago", "in 6 hours", "just now". Rounded to minutes, hours or days. */
export function relative(iso: string, now: Date = new Date()): string {
  const diff = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return "just now";
  const [n, unit] = minutes < 60 ? [minutes, "minute"] : minutes < 60 * 36 ? [Math.round(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  const text = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return diff < 0 ? `${text} ago` : `in ${text}`;
}
