/** One colour per competitor, by the order they were added. The first 3 are the design tokens. */
export const ENTITY = [
  { dot: "#0F62FE", tint: "#E8F0FF", text: "#0B4FD8" },
  { dot: "#7A5AF8", tint: "#F0ECFF", text: "#5B3FD6" },
  { dot: "#0E9384", tint: "#E2F5F2", text: "#0A7A6E" },
  { dot: "#DD2590", tint: "#FDF2FA", text: "#C11574" },
  { dot: "#475467", tint: "#F2F4F7", text: "#344054" },
] as const;

export const entity = (index: number) => ENTITY[index % ENTITY.length];

/** The event type a watch reports, as its tag says it. The watch itself keeps its page name (KIND_NAME). */
export const TAG = { changelog: "Feature", pricing: "Pricing", news: "News" } as const;
export const KIND_NAME = { changelog: "Changelog", pricing: "Pricing", news: "News" } as const;
