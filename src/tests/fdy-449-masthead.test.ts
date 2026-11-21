import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { LibraryMasthead, LIBRARY_APP_NAME, LIBRARY_HOME, LIBRARY_SIGN_IN } from "@/components/LibraryMasthead";
import { LIBRARY_APPBAR_LINKS, isShelfPath } from "@/components/LibraryAppBar";

const root = resolve(__dirname, "../..");
const render = (email: string | null) =>
  renderToStaticMarkup(createElement(LibraryMasthead, { email, edition: "November 2026 · Shelf Edition" }));

describe("FDY-449 · Faraday masthead on the Briefing Library", () => {
  it("vendored package matches its manifest (drift check)", () => {
    const out = execFileSync(process.execPath, [resolve(root, "src/lib/faraday-masthead/check-drift.mjs")], { encoding: "utf8" });
    expect(out).toContain("matches its manifest");
  });

  it("context slot says Briefing Library; mark + wordmark link to the Library's own home", () => {
    const html = render(null);
    expect(LIBRARY_APP_NAME).toBe("Briefing Library");
    expect(html).toContain('<span class="fm-app">Briefing Library</span>');
    expect(html).toContain(`<a class="fm-word" href="${LIBRARY_HOME}" aria-label="Faraday home">Faraday</a>`);
    expect(html).toContain(`<a class="fm-markl" href="${LIBRARY_HOME}"`);
    expect(html).not.toMatch(/class="fm-(word|markl)" href="https?:/);
  });

  it("signed out shows Sign in; signed in shows the email", () => {
    expect(render(null)).toContain(`<a class="fm-signin" href="${LIBRARY_SIGN_IN}">Sign in</a>`);
    const signed = render("reader@example.com");
    expect(signed).toContain('title="reader@example.com"');
    expect(signed).not.toContain("Sign in");
  });

  it("AppBar carries the top-level links (shelf + the old wordmark target); shelf nav stays in the page", () => {
    const html = render(null);
    expect(html).toContain('<nav class="fm-appbar" aria-label="Briefing Library">');
    for (const l of LIBRARY_APPBAR_LINKS) expect(html).toContain(`href="${l.href}"`);
    expect(html).toContain("https://faraday-intelligence.ai");
    expect(html).not.toMatch(/Theaters|Reserved Briefings|Search the shelf/);
  });

  it("shelf is current on / and /library only", () => {
    expect(isShelfPath("/")).toBe(true);
    expect(isShelfPath("/library")).toBe(true);
    expect(isShelfPath("/library/")).toBe(true);
    expect(isShelfPath("/library/b/x")).toBe(false);
    expect(isShelfPath("/b/x")).toBe(false);
    expect(isShelfPath("/library/cart")).toBe(false);
  });

  it("every /library page gets the masthead from one layout and owns a <main id=\"main\"> skip target", () => {
    const layout = readFileSync(resolve(root, "src/app/library/layout.tsx"), "utf8");
    expect(layout).toContain("<LibraryMasthead");
    const pages = ["library/page.tsx", "library/b/[slug]/page.tsx", "library/cart/page.tsx", "library/owned/page.tsx", "library/blueprint/page.tsx"];
    for (const p of pages) {
      const src = readFileSync(resolve(root, "src/app", p), "utf8");
      expect(src, p).not.toMatch(/<Masthead\b/);
      const shell = p === "library/page.tsx" ? readFileSync(resolve(root, "src/components/LibraryShell.tsx"), "utf8") : src;
      expect(shell, p).toContain('<main id="main"');
    }
    // the old Library header is gone (no double bars)
    expect(existsSync(resolve(root, "src/components/Masthead.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/page.tsx"))).toBe(false);
  });

  it("the masthead font families are aliased to the self-hosted files (no Google Fonts link)", () => {
    const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
    for (const fam of ["IBM Plex Serif", "Bricolage Grotesque", "IBM Plex Mono"]) expect(css).toContain(`font-family: "${fam}"`);
    expect(render(null)).not.toContain("fonts.googleapis.com");
  });
});
