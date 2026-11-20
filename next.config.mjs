/** @type {import('next').NextConfig} */

// FDY-398 (BL3-14): this app is the canonical Briefing Library and is served at
// https://library.faraday-intelligence.ai. The engine site (v0-faraday-daily-challenge)
// 308-redirects /briefing-library and /briefing-library/:path* to the subdomain, so the
// subdomain must answer at its root and at the short reader path. These are INTERNAL
// rewrites (same app), so /_next assets are unaffected. The /library/* routes keep working
// on every host.
export const libraryRewrites = [
  { source: "/", destination: "/library" },
  { source: "/b/:slug", destination: "/library/b/:slug" },
  { source: "/cart", destination: "/library/cart" },
  { source: "/owned", destination: "/library/owned" },
  { source: "/blueprint", destination: "/library/blueprint" },
];

// TODO(FDY-340): keep the storefront out of search indexes until BL3-12 publishes >= 10
// briefs; then remove this header and the robots metadata in src/app/layout.tsx.
export const noindexHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Supabase Storage is the system of record for preview PNGs.
    remotePatterns: [
      { protocol: "https", hostname: "ycadmmngkdhvpcsrcuaq.supabase.co" },
    ],
  },
  async rewrites() {
    return libraryRewrites;
  },
  async headers() {
    return [{ source: "/:path*", headers: noindexHeaders }];
  },
};

export default nextConfig;
