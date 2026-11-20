import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import config, { libraryRewrites, noindexHeaders } from "../../next.config.mjs";

type Rule = { source: string; destination: string };
const nextConfig = config as unknown as {
  rewrites: () => Promise<Rule[]>;
  headers: () => Promise<unknown[]>;
};

// FDY-398 (BL3-14): library.faraday-intelligence.ai serves this app at its root.
describe("BL3-14 public URL", () => {
  it("serves the shelf at the root route via an internal rewrite", async () => {
    const rewrites = await nextConfig.rewrites();
    expect(rewrites).toEqual(libraryRewrites);
    expect(rewrites).toContainEqual({ source: "/", destination: "/library" });
    // A page at "/" would win over an afterFiles rewrite, so it must not exist.
    expect(existsSync(resolve(__dirname, "../app/page.tsx"))).toBe(false);
  });

  it("maps the short reader path so /briefing-library/b/<slug> redirects land on the reader", () => {
    expect(libraryRewrites).toContainEqual({ source: "/b/:slug", destination: "/library/b/:slug" });
  });

  it("never rewrites to another origin (that would break /_next assets)", () => {
    for (const r of libraryRewrites as Rule[]) expect(r.destination.startsWith("/")).toBe(true);
  });

  it("stays noindex until FDY-340 publishes >= 10 briefs", async () => {
    const headers = await nextConfig.headers();
    expect(headers).toEqual([{ source: "/:path*", headers: noindexHeaders }]);
    expect(noindexHeaders).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    // layout.tsx pulls in next/font, which vitest cannot load; check the source instead.
    const layout = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });
});
