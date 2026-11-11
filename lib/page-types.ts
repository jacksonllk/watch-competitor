/**
 * The kinds of extra page a competitor can be watched on, beyond its pricing page and changelog.
 * Each has its own instruction for context.dev and a family that sets its tag colour. Its tag shows the page's own name.
 * Pure: safe in the browser, so the Add more monitors modal can name a custom address the same way.
 */
export type PageType = "careers" | "customers" | "security" | "compare" | "blog" | "other";

/** What a monitor on each kind of page does, in plain words for the screen. The instruction below is what context.dev's judge reads. */
export const PAGE_DESCRIPTIONS: Record<PageType, string> = {
  careers: "Tracks the jobs they open and close, with each role's team and location.",
  customers: "Notices when they add or remove a customer, logo or case study.",
  security: "Notices when they add or drop a certification, standard or data location.",
  compare: "Follows their comparison pages and the claims they make about other companies.",
  blog: "Picks up each new post and what it announces.",
  other: "Flags real changes to what the page says, such as products, prices or claims.",
};

/** What a monitor on each kind of page reports. The user's focus is added after it. */
export const PAGE_INSTRUCTIONS: Record<PageType, string> = {
  careers: "Report job openings that were added or closed, with their team and location. Ignore wording changes.",
  customers: "Report customer names, logos and case studies that were added or removed.",
  security: "Report certifications, compliance standards and data locations that were added or removed.",
  compare: "Report new comparison pages and changed claims about other companies, naming the company.",
  blog: "Report new posts: their title and what they announce. Ignore changes to older posts.",
  other:
    "Report meaningful changes to what this page says: products, prices, customers, claims or roles. Ignore wording, layout and testimonial changes.",
};

/** The colour family of a tag: the three main types, plus Hiring and Market for extra pages. */
export type Family = "changelog" | "pricing" | "news" | "hiring" | "market";

export function familyOfPage(page: PageType | undefined): Family {
  return page === "careers" ? "hiring" : page === "blog" ? "news" : "market";
}

/** What an address is, from its words: "acme.com/jobs" -> a careers page. Pricing and changelog words map to those types. */
export function guessPage(url: string): { kind: "pricing" | "changelog" } | { kind: "page"; page: PageType } {
  let path = url.toLowerCase();
  try {
    const u = new URL(url);
    path = `${u.hostname} ${u.pathname}`.toLowerCase();
  } catch {}
  const has = (re: RegExp) => re.test(path);
  if (has(/pricing|plans|billing|enterprise/)) return { kind: "pricing" };
  if (has(/changelog|release|updates|whats-new|features|product|integrations/)) return { kind: "changelog" };
  if (has(/careers|jobs|hiring|join/)) return { kind: "page", page: "careers" };
  if (has(/customers|case-stud|stories/)) return { kind: "page", page: "customers" };
  if (has(/security|trust|compliance|privacy/)) return { kind: "page", page: "security" };
  if (has(/compare|\/vs|alternative/)) return { kind: "page", page: "compare" };
  if (has(/blog|news|press/)) return { kind: "page", page: "blog" };
  return { kind: "page", page: "other" };
}
