import { familyOfPage, type Family, type PageType } from "@/lib/page-types";
import { TAG } from "./colors";

/**
 * One colour per family. A tag shows its page's own name ("Careers", "Enterprise"), and its colour shows the family:
 * Product (Feature, Integrations…), Pricing, News (and Blog), Hiring (Careers), Market (Customers, Comparisons…).
 * fg: dots and marks, checked together with the dataviz palette validator (all pairs, colour-blind safe, 10 Nov).
 * Five is the most that pass: a sixth colour cannot be told apart on a timeline dot, so names carry the rest.
 * text: a darker step of the same hue for tag words, at least 4.5:1 on its tint.
 */
export const TYPE_COLOR: Record<Family, { bg: string; fg: string; text: string }> = {
  changelog: { bg: "#EFEDFB", fg: "#6250D6", text: "#4B3BB5" },
  pricing: { bg: "#E6F4E6", fg: "#008300", text: "#006A00" },
  news: { bg: "#FBEAF1", fg: "#D55181", text: "#A8325F" },
  hiring: { bg: "#FBF3DC", fg: "#CA8A04", text: "#7A5300" },
  market: { bg: "#E2F4F8", fg: "#0891B2", text: "#066A82" },
};

export type Tagged = { kind: keyof typeof TAG; label?: string; page?: PageType };

/** The colour family of an event or a page. */
export function familyOf(t: Tagged): Family {
  return t.kind === "page" ? familyOfPage(t.page) : t.kind;
}

/** The tag's word: the page's own name for an extra page, else the type. */
export const tagText = (t: Tagged) => t.label ?? TAG[t.kind];

export function Tag(t: Tagged) {
  const c = TYPE_COLOR[familyOf(t)];
  return (
    <span
      className="text-label inline-flex h-5 min-w-[58px] shrink-0 items-center justify-center rounded-[5px] px-1.5 font-semibold whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {tagText(t)}
    </span>
  );
}
