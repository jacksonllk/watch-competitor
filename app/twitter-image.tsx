import { ImageResponse } from "next/og";
import { HomeCard, OG_FONTS } from "./og/cards";

// The same card as opengraph-image.tsx, for X's own image tag.
export const alt = "Watch Competitor: track your competitors' pricing, launches and news";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<HomeCard />, { ...size, fonts: OG_FONTS });
}
