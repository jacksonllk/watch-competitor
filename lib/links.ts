/** The open source repo. The footer links to it on every page. Private until launch: until then GitHub shows "not found" to others. */
export const REPO_URL = "https://github.com/jacksonllk/watch-competitor";
/**
 * Set true at launch, once the repo is public, the README has its deploy section, and the Deploy button was clicked end to
 * end (Jackson's rule: a one-click deploy button only for a host we deployed and tested). Until then the demo's
 * "run your own copy" card shows neither deploy link.
 */
export const LAUNCHED = false;
export const SELF_HOST_URL = LAUNCHED ? `${REPO_URL}#deploy-your-own` : "";
/** Where a context.dev link sits in the app, so its visits trace to this project. */
export type LinkSpot = "footer" | "demo_card" | "setup";

/** A link to context.dev tagged with this project and the spot it sits in. No visitor data goes in it. */
export function contextDevLink(spot: LinkSpot): string {
  return `https://context.dev/?utm_source=watch-competitor&utm_medium=${spot}&utm_campaign=open-source`;
}
/**
 * One-click deploy, for the one host we deploy and test ourselves (Vercel). Always shown next to "Other hosts".
 * Vercel's Deploy button (docs: vercel.com/docs/deploy-button/source): repository-url to clone, env to ask for the key,
 * and stores to add an Upstash Redis store from the Marketplace in the same flow (slugs from `vercel integration add
 * upstash/upstash-kv`). The env and stores parts are unverified until the button is clicked once the repo is public.
 */
export const DEPLOY_URL = LAUNCHED
  ? "https://vercel.com/new/clone?" +
    new URLSearchParams({
      "repository-url": REPO_URL,
      "project-name": "watch-competitor",
      env: "CONTEXT_DEV_API_KEY",
      envDescription: "Your context.dev API key. Restricted keys need Data APIs (use) and Monitors (manage).",
      envLink: "https://context.dev",
      stores: JSON.stringify([{ type: "integration", integrationSlug: "upstash", productSlug: "upstash-kv" }]),
    }).toString()
  : "";

/** The public demo: visitors can try every step, but nothing is created, checked or removed on the demo's key. */
export function isDemo(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "true";
}

/**
 * SUPPORT_URL (optional): where "Contact support" links in the app, such as https://acme.com/help or help@acme.com.
 * A bare email becomes a mailto: link. Unset or not a link or an email: "Contact support" shows as plain words.
 */
export function supportUrl(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.SUPPORT_URL?.trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return null;
}
