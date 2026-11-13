import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The preview image for links to the app (X, Slack, LinkedIn) and the GitHub social preview. Drawn with next/og, which supports flexbox only.
// Rules: light theme, no text under 28px (feeds show cards at about 40% size), no addresses or dates.
// Fonts: Inter (SIL Open Font License, see fonts/OFL.txt), read once when the module loads.

const root = process.cwd();
const [regular, semibold, logo, product] = await Promise.all([
  readFile(join(root, "app/og/fonts/Inter-Regular.ttf")),
  readFile(join(root, "app/og/fonts/Inter-SemiBold.ttf")),
  readFile(join(root, "public/watch-competitor-logo.png")),
  // The live demo's Overview for Sep 26 to Oct 25 (30 days) below the header, 900px wide at 2x, captured on 13 Nov 2026. The
  // timeline's "Today" button was hidden for the capture: it covers the last day's label at this width.
  // Retake it from the live demo when the Overview layout changes. Never from fixture data.
  readFile(join(root, "app/og/product.png")),
]);

export const OG_FONTS = [
  { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: semibold, weight: 600 as const, style: "normal" as const },
];

const LOGO = `data:image/png;base64,${logo.toString("base64")}`;
const PRODUCT = `data:image/png;base64,${product.toString("base64")}`;

// The app's colour tokens (app/globals.css).
const C = { bg: "#ffffff", ink: "#1b2430", muted: "#6b7686", rule: "#e6e9ee", accent: "#0047ff" };

// Name, what it does, three facts, and the whole Overview screenshot from the live demo, fitted inside the card.
export function HomeCard({ shot = { width: 580 } }: { shot?: { width: number } }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: C.bg, color: C.ink, fontFamily: "Inter", overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 560, flexShrink: 0, padding: "56px 0 60px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
          <img src={LOGO} width={48} height={48} alt="" />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600 }}>Watch Competitor</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.06 }}>Watch your competitors</div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: C.muted, lineHeight: 1.3 }}>
            Track changes to their pricing, product launches and news. Respond quickly through AI agents: plan features, brief sales or update your comparison page.
          </div>
          <div style={{ display: "flex", marginTop: 30, gap: 16, fontSize: 28 }}>
            {["Free", "Open source", "Customizable"].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: C.accent }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain img elements only */}
        <img
          src={PRODUCT}
          width={shot.width}
          height={Math.round((shot.width * 1316) / 1400)}
          style={{ borderRadius: 18, border: `2px solid ${C.rule}`, boxShadow: "0 24px 60px rgba(27,36,48,0.12)" }}
          alt=""
        />
      </div>
    </div>
  );
}
