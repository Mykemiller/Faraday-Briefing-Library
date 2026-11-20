import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (OFL) rather than next/font/google: Vercel's build region started receiving
// extension-less Google font URLs (/l/font?kit=...), which crash Next 14.2's Google loader
// ("Cannot read properties of null (reading '1')"). Latin subset, same families/weights. FDY-398.
const serif = localFont({
  src: [
    { path: "./fonts/ibm-plex-serif-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-serif-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/ibm-plex-serif-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-serif-600-italic.woff2", weight: "600", style: "italic" },
    { path: "./fonts/ibm-plex-serif-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/ibm-plex-serif-700-italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
});
const sans = localFont({
  src: [{ path: "./fonts/bricolage-grotesque-400-600-normal.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Briefing Library — Faraday Intelligence",
  description: "A reading room for Faraday's cultivated intelligence. Your unfair advantage.",
  // TODO(FDY-340): noindex until BL3-12 publishes >= 10 briefs (see next.config.mjs).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
