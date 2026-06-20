import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Briefing Library — Faraday Intelligence",
  description: "A reading room for Faraday's cultivated intelligence. Your unfair advantage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Fonts (IBM Plex Serif / Bricolage Grotesque / IBM Plex Mono) loaded via the app shell. */}
      <body>{children}</body>
    </html>
  );
}
