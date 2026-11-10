/** Public links shown in the app. Fill REPO_URL when the repo is public: the demo's "run your own copy" card links to it. */
export const REPO_URL = "";
export const SELF_HOST_URL = REPO_URL ? `${REPO_URL}#deploy-your-own` : "";
export const CONTEXT_SIGNUP_URL = "https://context.dev";
/**
 * One-click deploy, for the one host we deploy and test ourselves (Vercel). Always shown next to "Other hosts".
 * Vercel's Deploy button (docs: vercel.com/docs/deploy-button/source): repository-url to clone, env to ask for the key,
 * and stores to add an Upstash Redis store from the Marketplace in the same flow (slugs from `vercel integration add
 * upstash/upstash-kv`). The env and stores parts are unverified until the button is clicked once the repo is public.
 */
export const DEPLOY_URL = REPO_URL
  ? "https://vercel.com/new/clone?" +
    new URLSearchParams({
      "repository-url": REPO_URL,
      "project-name": "competitor-watch",
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
