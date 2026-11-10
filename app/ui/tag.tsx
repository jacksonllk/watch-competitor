import { TAG } from "./colors";

/**
 * One colour per event type. The competitor is shown by its logo, so the tag only says what happened.
 * fg: dots and marks, checked with the dataviz palette validator (all pairs, colour-blind safe, 3:1 on white, 10 Nov).
 * text: a darker step of the same hue for tag words, at least 4.5:1 on its tint. No blue, which read as a template.
 */
export const TYPE_COLOR = {
  changelog: { bg: "#EFEDFB", fg: "#6250D6", text: "#4B3BB5" },
  pricing: { bg: "#E6F4E6", fg: "#008300", text: "#006A00" },
  news: { bg: "#FBEAF1", fg: "#D55181", text: "#A8325F" },
} as const;

export function Tag({ kind }: { kind: keyof typeof TAG }) {
  const c = TYPE_COLOR[kind];
  return (
    <span
      className="text-label inline-flex h-5 w-[58px] shrink-0 items-center justify-center rounded-[5px] font-semibold"
      style={{ background: c.bg, color: c.text }}
    >
      {TAG[kind]}
    </span>
  );
}
