"use client";

import { useState } from "react";
import { entity } from "./colors";

/**
 * A competitor's logo, or its initials on its colour when there is no logo or it fails to load.
 * The logo is a Logo Link URL saved at Add: shown directly, never downloaded or stored (Logo Link terms).
 * Showing it calls no context.dev API and uses no credits. Logo Link has its own quota.
 */
/** Type scale sizes only: label, small, heading. Small marks show one letter. */
const FONT = { 16: 11, 20: 11, 32: 12, 48: 15 } as const;

export function CompanyMark({
  name,
  logo,
  colorIndex,
  size = 20,
}: {
  name: string;
  logo: string | null;
  colorIndex?: number;
  size?: 16 | 20 | 32 | 48;
}) {
  const [failed, setFailed] = useState(false);
  const radius = size >= 32 ? 8 : 4;
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 border border-rule bg-white object-contain"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const letters =
    name
      .replace(/[^A-Za-z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  // Without a competitor colour (search results, the Add panel): pale tile, dark letters. With one: its colour, white letters.
  const c = colorIndex === undefined ? { dot: "#E8F0FF", ink: "#0B4FD8" } : { dot: entity(colorIndex).dot, ink: "#FFFFFF" };
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center font-semibold"
      style={{ width: size, height: size, borderRadius: radius, background: c.dot, color: c.ink, fontSize: FONT[size] }}
    >
      {size <= 20 ? letters.slice(0, 1) : letters}
    </span>
  );
}
