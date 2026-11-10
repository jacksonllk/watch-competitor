/**
 * Finds a competitor's pricing page and changelog by asking the site directly for the usual addresses.
 * Plain web requests: no context.dev call, no credits. Never guesses: a page counts only when the site serves it.
 * Ported from page-token-meter (lib/keypages.ts, lib/plain-fetch.ts) and extended after real checks on 8 Nov:
 * e2b.dev/changelog redirects to /product-updates (accept), changelog.daytona.io redirects to the home page (reject).
 */
import { lookup } from "node:dns/promises";
import { guessPage, type PageType } from "./page-types";
import { isIP } from "node:net";

export type PageKind = "pricing" | "changelog";
/** One request without following redirects. null: blocked, unreachable or timed out. */
export type Hop = { status: number; location: string | null };
export type FetchHop = (url: URL) => Promise<Hop | null>;
/** The page to watch, and other pages that also matched, so the user can switch. */
export type FoundPage = { url: string; others: string[] };
export type FoundPages = Record<PageKind, FoundPage | null>;

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 8000;

/** Paths to try on the main site, best first. */
const PATHS: Record<PageKind, string[]> = {
  pricing: ["/pricing", "/plans"],
  changelog: ["/changelog", "/product-updates", "/releases", "/release-notes", "/whats-new", "/docs/changelog"],
};

/** The last part of the final address must say what the page is. */
const LAST_SEGMENT: Record<PageKind, RegExp> = {
  pricing: /^(pricing|plans)$/,
  changelog: /^(changelog|product-updates|releases|release-notes|whats-new|updates)$/,
};

function candidates(kind: PageKind, domain: string): URL[] {
  const urls = PATHS[kind].map((path) => new URL(`https://${domain}${path}`));
  if (kind === "changelog") urls.push(new URL(`https://changelog.${domain}/`), new URL(`https://docs.${domain}/changelog`));
  // Some keep pricing in their docs, such as docs.boat.dev/pricing (checked 9 Nov). The main site's page still wins.
  if (kind === "pricing") urls.push(new URL(`https://docs.${domain}/pricing`));
  return urls;
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function onSite(url: URL, domain: string): boolean {
  const host = bareHost(url.hostname);
  return host === domain || host.endsWith(`.${domain}`);
}

function isMainSite(url: URL, domain: string): boolean {
  return bareHost(url.hostname) === domain;
}

/** Whether the final address is a real pricing page or changelog on the competitor's own site. */
export function accepts(kind: PageKind, url: URL, domain: string): boolean {
  if (!onSite(url, domain)) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  const last =
    segments
      .at(-1)
      ?.toLowerCase()
      .replace(/\.(html?|md)$/, "") ?? "";
  if (LAST_SEGMENT[kind].test(last)) return true;
  // A changelog site of its own, such as changelog.acme.com. Not the main site's home page.
  return kind === "changelog" && segments.length === 0 && bareHost(url.hostname) === `changelog.${domain}`;
}

/** Follows redirects. Returns the final address when it answers 200, else null. */
export async function resolve(start: URL, fetchHop: FetchHop): Promise<URL | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchHop(url);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = new URL(res.location, url);
      continue;
    }
    return res.status === 200 ? url : null;
  }
  return null;
}

function key(url: URL): string {
  return `${bareHost(url.hostname)}${url.pathname.replace(/\/$/, "")}`;
}

export async function findPage(kind: PageKind, domain: string, fetchHop: FetchHop): Promise<FoundPage | null> {
  const finals = await Promise.all(candidates(kind, domain).map((url) => resolve(url, fetchHop)));
  const seen = new Set<string>();
  const found: URL[] = [];
  for (const url of finals) {
    if (!url || !accepts(kind, url, domain) || seen.has(key(url))) continue;
    seen.add(key(url));
    found.push(url);
  }
  if (!found.length) return null;
  // The main site's page first, then the order of PATHS.
  const best = found.find((url) => isMainSite(url, domain)) ?? found[0];
  return { url: best.href, others: found.filter((url) => url !== best).map((url) => url.href) };
}

/** Finds both pages. domain: the competitor's bare domain, such as "e2b.dev". */
export async function findPages(domain: string, fetchHop: FetchHop = webHop): Promise<FoundPages> {
  const site = bareHost(domain);
  const [pricing, changelog] = await Promise.all([findPage("pricing", site, fetchHop), findPage("changelog", site, fetchHop)]);
  return { pricing, changelog };
}

// Private, local and reserved addresses. Our server must never fetch these for a user.
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** A public https or http address whose name points only to public servers. */
async function isPublic(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password || isIP(url.hostname) || !url.hostname.includes(".")) return false;
  try {
    const addresses = await lookup(url.hostname, { all: true });
    return addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** The real network step: one GET without following redirects. The body is never read. */
export const webHop: FetchHop = async (url) => {
  if (!(await isPublic(url))) return null;
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "watch-competitor" },
    });
    await res.body?.cancel();
    return { status: res.status, location: res.headers.get("location") };
  } catch {
    return null;
  }
};

/**
 * Checks an address the user typed, such as "acme.com/changelog". Returns the final address after
 * redirects when the page answers 200, else null. Free: plain requests, no context.dev call.
 */
export async function checkAddress(input: string, fetchHop: FetchHop = webHop): Promise<string | null> {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const final = await resolve(url, fetchHop);
  return final ? final.href : null;
}

/** Pages worth an extra monitor, beyond the pricing page and changelog. kind sets the event type their changes get. */
const MORE: { path: string; label: string }[] = [
  { path: "/enterprise", label: "Enterprise" },
  { path: "/product", label: "Product" },
  { path: "/features", label: "Features" },
  { path: "/integrations", label: "Integrations" },
  { path: "/customers", label: "Customers" },
  { path: "/compare", label: "Comparisons" },
  { path: "/security", label: "Security" },
  { path: "/blog", label: "Blog" },
  { path: "/careers", label: "Careers" },
];

/** A suggested extra page. kind and page come from its address (guessPage), so Careers is a careers page, not a Feature. */
export type MorePage = { kind: PageKind | "page"; url: string; label: string; page?: PageType };

/** An extra page from its address and name: its type and, for other pages, which kind of page. */
export function morePage(url: string, label: string): MorePage {
  const guess = guessPage(url);
  return guess.kind === "page" ? { kind: "page", url, label, page: guess.page } : { kind: guess.kind, url, label };
}

/**
 * Recommended extra pages for Add more monitors: the other pricing pages and changelogs the scan found, then the
 * common pages above that open on their own site at the same path (a redirect to the home page does not count).
 * Free: plain requests to their site. Never the pages already chosen.
 */
export async function findMorePages(domain: string, found: FoundPages | null, chosen: string[], fetchHop: FetchHop = webHop): Promise<MorePage[]> {
  const site = bareHost(domain);
  const taken = new Set(chosen.map((u) => key(new URL(u))));
  const out: MorePage[] = [];
  const add = (page: MorePage) => {
    const k = key(new URL(page.url));
    if (taken.has(k)) return;
    taken.add(k);
    out.push(page);
  };
  for (const kind of ["pricing", "changelog"] as const) {
    for (const url of found?.[kind]?.others ?? [])
      add({ kind, url, label: `${kind === "pricing" ? "Pricing" : "Changelog"} · ${bareHost(new URL(url).hostname)}` });
  }
  const finals = await Promise.all(MORE.map((m) => resolve(new URL(`https://${site}${m.path}`), fetchHop)));
  MORE.forEach((m, i) => {
    const url = finals[i];
    if (url && onSite(url, site) && url.pathname.replace(/\/$/, "") === m.path) add(morePage(url.href, m.label));
  });
  return out;
}
