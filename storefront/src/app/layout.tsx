import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { SampleBanner } from "@/components/SampleBanner";
import { fixturesEnabled } from "@/lib/fixtures";
import "./globals.css";

// Same three families as the root app (Brand Bible: serif display, grotesque UI, mono metadata).
const serif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Bricolage_Grotesque({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "The Briefing Library — Faraday", template: "%s — The Briefing Library" },
  description: "Faraday's published briefings on the infrastructure buildout. Every claim traced to a source.",
  robots: { index: false, follow: false }, // draft storefront
};

export const viewport: Viewport = { themeColor: "#1C3424" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col bg-paper text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-gold focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        {fixturesEnabled() ? <SampleBanner /> : null}
        <Masthead />
        <main id="main" className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
