import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { publicAddress } from "@/lib/webhook";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "600"] });

const title = "Watch Competitor";
const description = "Track changes to your competitors' pricing, product launches and news. Respond quickly through AI agents.";

// metadataBase makes the preview image's address absolute: the copy's own address (APP_URL, or Vercel's production domain).
export const metadata: Metadata = {
  metadataBase: new URL(publicAddress() || "http://localhost:3000"),
  title,
  description,
  openGraph: { siteName: title, type: "website", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
