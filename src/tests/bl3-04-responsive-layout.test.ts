import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Masthead } from "@/components/Masthead";
import { LibraryShell } from "@/components/LibraryShell";
import type { ShelfPage } from "@/lib/types";
import { evaluate, parseArgs, DEFAULT_WIDTHS, SIDEBAR_PX, CONTENT_MAX_PX } from "../../scripts/ops/layout-check.mjs";

const page: ShelfPage = {
  items: [],
  nextCursor: null,
  facets: { theme: [], domain: [], subdomain: [], company: [] },
  availableCount: 0,
  comingSoonCount: 0,
};

describe("BL3-04 layout classes", () => {
  it("content wrapper is max-w-[1680px], left-aligned (no mx-auto), next to a 248 px sidebar hidden below md", () => {
    const html = renderToStaticMarkup(createElement(LibraryShell, { initial: page, theaters: [] }));
    const main = html.slice(html.indexOf("<main"));
    const wrapper = main.match(/<main[^>]*>\s*<div class="([^"]*)"/)![1];
    expect(wrapper.split(/\s+/)).toContain("max-w-[1680px]");
    expect(wrapper).not.toMatch(/mx-auto/);
    expect(html).not.toContain("max-w-[1180px]");
    const aside = html.match(/<aside class="([^"]*)"/)![1];
    expect(aside).toContain("w-[248px]");
    expect(aside).toContain("shrink-0");
    expect(aside).toContain("max-md:hidden");
    // readable text blocks keep their own max widths
    expect(html).toContain("max-w-[560px]");
    expect(html).toContain("max-w-[380px]");
  });

  it("masthead: full-width <header>, inner row uses the content gutters, nothing clips or shrinks the edges", () => {
    const html = renderToStaticMarkup(createElement(Masthead, { context: "The Briefing Library", edition: "November 2026 · Shelf Edition" }));
    expect(html.startsWith("<header")).toBe(true);
    expect(html).toContain("data-masthead");
    expect(html).not.toMatch(/overflow-hidden/);
    expect(html).toMatch(/class="[^"]*\bpx-6\b[^"]*\bmd:px-11\b/);
    const classesOf = (re: RegExp) => new Set((html.match(re)?.[1] ?? "").split(/\s+/));
    const brand = classesOf(/<a [^>]*class="([^"]*)"[^>]*aria-label="Faraday home"/);
    const edition = classesOf(/class="([^"]*)">November 2026/);
    const context = classesOf(/class="([^"]*)">The Briefing Library/);
    expect(brand.has("shrink-0")).toBe(true);
    for (const c of ["whitespace-nowrap", "shrink-0", "max-md:hidden"]) expect(edition.has(c), c).toBe(true);
    for (const c of ["min-w-0", "truncate"]) expect(context.has(c), c).toBe(true);
  });
});

type M = Parameters<typeof evaluate>[0];

describe("BL3-04 layout-check verdicts (scripts/ops/layout-check.mjs)", () => {
  const wide = (over: Partial<M> = {}): M => ({
    width: 2560,
    scrollWidth: 2560,
    clientWidth: 2560,
    headerRight: 2560,
    headerChildMaxRight: 2516,
    sidebarVisible: true,
    sidebarWidth: 248,
    gridWidth: 1680,
    contentWidth: 1680,
    contentLeft: 44,
    contentPadRight: 44,
    gridColumns: 6,
    ...over,
  });
  const ok = (m: M) => Object.fromEntries(evaluate(m).map((c: { name: string; ok: boolean }) => [c.name, c.ok]));

  it("defaults: widths 390/1280/1920/2560, sidebar 248, content max 1680", () => {
    expect(DEFAULT_WIDTHS).toEqual([390, 1280, 1920, 2560]);
    expect(SIDEBAR_PX).toBe(248);
    expect(CONTENT_MAX_PX).toBe(1680);
    expect(parseArgs(["--url", "http://x", "--widths", "1280,1920"]).widths).toEqual([1280, 1920]);
    expect(() => parseArgs([])).toThrow();
  });

  it("2560: passes at 1680 px; the old 1180 px cap fails the grid check", () => {
    expect(ok(wide())).toEqual({ overflow: true, header: true, sidebar: true, grid: true });
    expect(ok(wide({ gridWidth: 1180, contentWidth: 1180 })).grid).toBe(false);
    // a card grid narrower than its column fails; no rendered grid (all lines closed) judges the column
    expect(ok(wide({ gridWidth: 900 })).grid).toBe(false);
    expect(ok(wide({ gridWidth: null })).grid).toBe(true);
  });

  it("uses clientWidth, so a 15 px classic scrollbar does not false-fail", () => {
    const m = wide({ width: 1920, clientWidth: 1905, scrollWidth: 1905, headerRight: 1905, headerChildMaxRight: 1861, gridWidth: 1569, contentWidth: 1569 });
    expect(ok(m)).toEqual({ overflow: true, header: true, sidebar: true, grid: true });
    expect(ok({ ...m, headerChildMaxRight: 1915 }).header).toBe(false);
  });

  it("flags: widths validated, trailing slash trimmed", () => {
    expect(() => parseArgs(["--url", "http://x", "--widths", "abc"])).toThrow();
    expect(() => parseArgs(["--url", "http://x", "--widths"])).toThrow();
    expect(parseArgs(["--url", "http://x/"]).url).toBe("http://x");
  });

  it("1280 / 1920: the grid must fill the column (viewport − sidebar − gutters)", () => {
    expect(ok(wide({ width: 1280, scrollWidth: 1280, clientWidth: 1280, headerRight: 1280, headerChildMaxRight: 1236, gridWidth: 944, contentWidth: 944 })).grid).toBe(true);
    expect(ok(wide({ width: 1920, scrollWidth: 1920, clientWidth: 1920, headerRight: 1920, headerChildMaxRight: 1876, gridWidth: 1584, contentWidth: 1584 })).grid).toBe(true);
    expect(ok(wide({ width: 1920, scrollWidth: 1920, clientWidth: 1920, headerRight: 1920, headerChildMaxRight: 1876, gridWidth: 1180, contentWidth: 1180 })).grid).toBe(false);
  });

  it("horizontal scroll or a header child past the edge fails", () => {
    expect(ok(wide({ scrollWidth: 2600 })).overflow).toBe(false);
    expect(ok(wide({ headerChildMaxRight: 2575 })).header).toBe(false);
    expect(ok(wide({ headerRight: null })).header).toBe(false);
  });

  it("sidebar must be exactly 248 px from md up, and hidden on mobile with one column", () => {
    expect(ok(wide({ sidebarWidth: 220 })).sidebar).toBe(false);
    const mobile: M = { width: 390, scrollWidth: 390, clientWidth: 390, headerRight: 390, headerChildMaxRight: 366, sidebarVisible: false, sidebarWidth: null, gridWidth: 342, contentWidth: 342, contentLeft: 24, contentPadRight: 24, gridColumns: 1 };
    expect(ok(mobile)).toEqual({ overflow: true, header: true, sidebar: true, grid: true });
    expect(ok({ ...mobile, gridColumns: 2 }).grid).toBe(false);
    expect(ok({ ...mobile, sidebarVisible: true }).sidebar).toBe(false);
  });
});
