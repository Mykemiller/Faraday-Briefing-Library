import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildShelfSections, hasMoreAvailable, mergePlannedRuns } from "@/lib/shelf-sections";
import { inProductionLabel, stripComingSoon } from "@/lib/brand";
import { filterRows, inProductionByType, search } from "@/lib/catalog-model";
import { briefingToCatalog } from "@/lib/shelf-map";
import { Shelf } from "@/components/Shelf";
import { LibraryShell } from "@/components/LibraryShell";
import type { BriefingRow, Lookups } from "@/lib/briefings-source";
import type { CatalogBriefing, ShelfPage } from "@/lib/types";

const card = (over: Partial<CatalogBriefing> & { id: string; briefingType: CatalogBriefing["briefingType"] }): CatalogBriefing => ({
  slug: over.id,
  title: over.id,
  description: "",
  status: "Coming Soon",
  canonicalFlag: "Canonical",
  gammaUrl: null,
  gammaId: null,
  themes: [],
  domains: [],
  subdomains: [],
  companies: [],
  downloadCount: 0,
  goLiveDate: null,
  byline: "Gilbert",
  hypothesis: "",
  contents: [],
  previewSlides: null,
  ...over,
});
const avail = (id: string, type: CatalogBriefing["briefingType"], date: string, over: Partial<CatalogBriefing> = {}) =>
  card({ id, briefingType: type, status: "Available", goLiveDate: date, title: `Avail ${id}`, ...over });
const planned = (id: string, type: CatalogBriefing["briefingType"], title: string) => card({ id, briefingType: type, title });

const render = (props: Parameters<typeof Shelf>[0]) => renderToStaticMarkup(createElement(Shelf, props));
const NONE = new Set<string>();

/** Split rendered HTML into its <section> blocks, keyed by data-shelf-section. */
function sectionsOf(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<section[^>]*data-shelf-section="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)) out[m[1]] = m[2];
  return out;
}

describe("BL3-03 grouping + ordering (shelf-sections model)", () => {
  const items = [
    planned("p-z", "company", "Zeta Power"),
    avail("a-old", "company", "2026-09-01"),
    planned("p-a", "company", "Coming Soon — Alpha Grid"),
    avail("a-new", "company", "2026-11-01"),
    avail("a-same-2", "company", "2026-10-01"),
    avail("a-same-1", "company", "2026-10-01"),
    planned("p-m", "company", "midland"),
    planned("t-1", "thread", "Neoclouds"),
  ];

  it("groups by type in SHELF_GROUPS order and omits empty types", () => {
    expect(buildShelfSections(items).map((s) => s.type)).toEqual(["thread", "company"]);
  });

  it("Available first: newest go_live_date desc, then id desc (keyset order)", () => {
    const company = buildShelfSections(items).find((s) => s.type === "company")!;
    expect(company.available.map((b) => b.id)).toEqual(["a-new", "a-same-2", "a-same-1", "a-old"]);
  });

  it("planned alphabetical by display title (prefix ignored, case-insensitive), then id", () => {
    const company = buildShelfSections(items).find((s) => s.type === "company")!;
    expect(company.planned.map((b) => b.id)).toEqual(["p-a", "p-m", "p-z"]);
  });

  it("N counts non-Available rows of the type; the server count wins when larger (paging)", () => {
    const s = buildShelfSections(items);
    expect(s.find((x) => x.type === "company")!.inProduction).toBe(3);
    expect(s.find((x) => x.type === "thread")!.inProduction).toBe(1);
    const paged = buildShelfSections(items, { company: 40, thread: 1, sector: 7 });
    expect(paged.find((x) => x.type === "company")!.inProduction).toBe(40);
    // a type with no loaded rows but planned rows beyond this page still gets its section
    expect(paged.map((x) => x.type)).toEqual(["sector", "thread", "company"]);
    expect(paged.find((x) => x.type === "sector")!.planned).toEqual([]);
  });

  it("server per-type counts span every matching row, not the page", () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => planned(`c${String(i).padStart(2, "0")}`, "company", `Co ${i}`)),
      avail("a1", "company", "2026-11-01"),
      planned("j1", "jurisdiction", "Texas"),
    ];
    const page = search(rows, { sort: "newest", limit: 48 });
    expect(page.items.length).toBe(48);
    expect(page.items[0].id).toBe("a1"); // Available (dated) rows lead the keyset order
    expect(inProductionByType(filterRows(rows, {}))).toEqual({ company: 60, jurisdiction: 1 });
    expect(inProductionByType(filterRows(rows, { type: "jurisdiction" }))).toEqual({ jurisdiction: 1 });
    expect(inProductionByType(filterRows(rows, { q: "texas" }))).toEqual({ jurisdiction: 1 });
  });
});

describe("BL3-03 copy", () => {
  it('"N in production", singular "1 in production"', () => {
    expect(inProductionLabel(1)).toBe("1 in production");
    expect(inProductionLabel(12)).toBe("12 in production");
  });
});

describe("BL3-03 rendered shelf", () => {
  it("Available render as cards; planned collapse into one closed <details> per section", () => {
    const html = render({
      items: [avail("a1", "company", "2026-11-01"), planned("p1", "company", "Beta"), planned("p2", "company", "Alpha")],
      reservedIds: NONE,
    });
    const company = sectionsOf(html).company;
    const before = company.slice(0, company.indexOf("<details"));
    expect(before).toContain("data-shelf-available");
    expect(before).toContain('href="/library/b/a1"');
    expect(before).not.toContain("Coming soon");
    expect(company.match(/<details/g)!.length).toBe(1);
    expect(company).not.toMatch(/<details[^>]*\sopen/);
    expect(company).toMatch(/<summary[^>]*>[\s\S]*2 in production<\/summary>/);
    // planned cards live only inside the details, alphabetical
    const inside = company.slice(company.indexOf("<details"));
    expect(inside.indexOf("Alpha")).toBeLessThan(inside.indexOf("Beta"));
  });

  it("a section with 0 Available and N>0 planned shows only the line, never a card grid outside it", () => {
    const html = render({ items: [planned("p1", "thread", "One")], reservedIds: NONE });
    const thread = sectionsOf(html).thread;
    expect(thread).not.toContain("data-shelf-available");
    const outside = thread.slice(0, thread.indexOf("<details"));
    expect(outside).not.toContain("<article");
    expect(thread).toMatch(/1 in production<\/summary>/);
  });

  it("each rendered section shows cards or the 'N in production' line", () => {
    const html = render({
      items: [avail("a1", "theater", "2026-10-01"), planned("p1", "sector", "S"), avail("a2", "company", "2026-10-02"), planned("p2", "company", "C")],
      reservedIds: NONE,
      inProductionByType: { jurisdiction: 3 },
    });
    const secs = sectionsOf(html);
    expect(Object.keys(secs)).toEqual(["theater", "sector", "company", "jurisdiction"]);
    for (const [type, body] of Object.entries(secs)) {
      expect(body.includes("data-shelf-available") || /\d+ in production<\/summary>/.test(body), type).toBe(true);
    }
    expect(secs.theater).not.toContain("<details");
    expect(secs.jurisdiction).toMatch(/3 in production<\/summary>/);
  });

  it('a planned card carries the "Coming soon" badge; no rendered title contains "Coming Soon —"', () => {
    const raw = planned("p1", "company", "Coming Soon — Nutanix");
    const html = render({ items: [raw, avail("a1", "company", "2026-11-01")], reservedIds: NONE });
    expect(html).toContain('data-badge="coming-soon"');
    expect(html.match(/data-badge="coming-soon"/g)!.length).toBe(1); // planned only, never on Available
    expect(html).toContain(">Coming soon</span>");
    expect(html).toContain("Nutanix");
    expect(html).not.toMatch(/Coming Soon\s*[—–-]/i);
    expect(stripComingSoon(raw.title)).toBe("Nutanix");
  });

  it("the data layer strips the prefix too (planned briefings row with the prefix in its raw title)", () => {
    const lookups: Lookups = { themes: new Map(), domains: new Map(), subdomains: new Map(), companies: new Map([["C1", "Nutanix"]]) };
    const row = {
      id: "r1", airtable_record_id: "recXYZ0001", title: "Coming Soon — Nutanix", status: "planned", tier: null, sector_id: null,
      thread_id: null, theme_tags: null, company_id: "C1", institution_id: null, jurisdiction_id: null, briefing_type: null,
      byline: null, hypothesis: null, contents: null, published_at: null, last_refreshed: null, updated_at: "2026-11-12T00:00:00Z",
    } as BriefingRow;
    const c = briefingToCatalog(row, lookups)!;
    const html = render({ items: [c], reservedIds: NONE, openPlanned: true });
    expect(html).not.toMatch(/Coming Soon\s*[—–-]/i);
  });

  it("active search / Theater filter opens the details when it matches planned rows", () => {
    const html = render({ items: [planned("p1", "company", "Alpha")], reservedIds: NONE, openPlanned: true });
    expect(html).toMatch(/<details[^>]*\sopen=""/);
    // matches only beyond the loaded page: still opens (opening loads the run, see LibraryShell)
    const none = render({ items: [], reservedIds: NONE, openPlanned: true, inProductionByType: { company: 4 } });
    expect(none).toMatch(/<details[^>]*\sopen=""/);
    expect(none).toContain("4 in production");
    // no filter: closed
    expect(render({ items: [planned("p1", "company", "Alpha")], reservedIds: NONE })).not.toMatch(/<details[^>]*\sopen/);
  });

  it("retired rows never appear (BL3-01 mapping) and an empty shelf shows the existing empty state", () => {
    const lookups: Lookups = { themes: new Map(), domains: new Map(), subdomains: new Map(), companies: new Map([["C1", "X"]]) };
    const retired = {
      id: "r2", airtable_record_id: null, title: "Old", status: "retired", tier: null, sector_id: null, thread_id: null,
      theme_tags: null, company_id: "C1", institution_id: null, jurisdiction_id: null, briefing_type: null, byline: null,
      hypothesis: null, contents: null, published_at: null, last_refreshed: null, updated_at: "2026-11-12T00:00:00Z",
    } as BriefingRow;
    expect(briefingToCatalog(retired, lookups)).toBeNull();
    const html = render({ items: [], reservedIds: NONE });
    expect(html).toContain("Nothing on this shelf yet.");
    expect(html).not.toContain("in production");
  });

  it("LibraryShell passes the page's per-type counts through (0 published, planned beyond the page)", () => {
    const initial: ShelfPage = {
      items: [planned("p1", "company", "Alpha")],
      nextCursor: "null|p1",
      facets: { theme: [], domain: [], subdomain: [], company: [] },
      availableCount: 0,
      comingSoonCount: 400,
      inProductionByType: { company: 120, jurisdiction: 45 },
    };
    const html = renderToStaticMarkup(createElement(LibraryShell, { initial, theaters: [] }));
    expect(html).toContain("120 in production");
    expect(html).toContain("45 in production");
    // fewer than N loaded: the line offers its own A–Z load; the page-level button is hidden
    // because the last loaded row is planned (no Available rows left to page through)
    expect(html).toContain("Show more in production");
    expect(html).not.toContain("More from the shelf");
    expect(html).not.toContain("More of these load with");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });
});

describe("BL3-03 lazy A–Z planned runs", () => {
  const many = Array.from({ length: 130 }, (_, i) =>
    planned(`id${String(1000 - i)}`, i % 2 ? "company" : "theater", `Title ${String.fromCharCode(65 + (i % 26))}${i}`),
  );

  it("sort=az pages by keyset: contiguous, no duplicates, complete, in compareAz order", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r = search(many, { type: "company", status: "Coming Soon", sort: "az", cursor, limit: 48 });
      seen.push(...r.items.map((b) => b.id));
      cursor = r.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    const expected = many.filter((b) => b.briefingType === "company").sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || (a.id < b.id ? -1 : 1));
    expect(pages).toBe(2);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expected.map((b) => b.id));
  });

  it('az cursor survives "|" and "%" in titles and duplicate titles (URL round trip)', () => {
    const odd = ["A|B", "A|B", "a|b", "100% Grid", "Zed%7C", "x|y|z", "Émile", "emile"].map((t, i) => planned(`r${i}`, "company", t));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const r = search(odd, { sort: "az", cursor, limit: 3 });
      seen.push(...r.items.map((b) => b.id));
      if (!r.nextCursor) break;
      cursor = new URLSearchParams(new URLSearchParams({ cursor: r.nextCursor }).toString()).get("cursor");
    }
    expect(seen.length).toBe(odd.length);
    expect(new Set(seen).size).toBe(odd.length);
    // a malformed cursor restarts from the first page rather than throwing
    expect(search(odd, { sort: "az", cursor: "az:%E0%A4|zz", limit: 3 }).items.length).toBe(3);
  });

  it("an expanded type shows exactly its A–Z run; other types and Available rows come from the page", () => {
    const page = [avail("a1", "company", "2026-11-01"), planned("pz", "company", "Zulu"), planned("t9", "theater", "Theta")];
    const run = { items: [planned("pa", "company", "Alpha"), planned("pb", "company", "Bravo")] };
    const merged = mergePlannedRuns(page, { company: run });
    expect(merged.map((b) => b.id)).toEqual(["a1", "t9", "pa", "pb"]);
    const company = buildShelfSections(merged, { company: 3, theater: 1 }).find((s) => s.type === "company")!;
    expect(company.planned.map((b) => b.title)).toEqual(["Alpha", "Bravo"]);
    expect(company.inProduction).toBe(3);
    // a run that repeats a page row is de-duplicated
    expect(mergePlannedRuns([planned("pa", "company", "Alpha")], { company: run }).map((b) => b.id)).toEqual(["pa", "pb"]);
  });

  it('"More from the shelf" only while Available rows remain', () => {
    expect(hasMoreAvailable({ items: [avail("a1", "company", "2026-11-01")], nextCursor: "2026-11-01|a1" })).toBe(true);
    expect(hasMoreAvailable({ items: [avail("a1", "company", "2026-11-01"), planned("p", "company", "P")], nextCursor: "null|p" })).toBe(false);
    expect(hasMoreAvailable({ items: [planned("p", "company", "P")], nextCursor: "null|p" })).toBe(false);
    expect(hasMoreAvailable({ items: [avail("a1", "company", "2026-11-01")], nextCursor: null })).toBe(false);
  });

  it("the shell asks the catalog API for type + status=Coming Soon + sort=az", () => {
    const src = readFileSync("src/components/LibraryShell.tsx", "utf8");
    expect(src).toMatch(/params\.set\("status", "Coming Soon"\)/);
    expect(src).toMatch(/params\.set\("sort", "az"\)/);
    expect(src).toMatch(/params\.set\("type", type\)/);
    const route = readFileSync("src/app/api/library/catalog/route.ts", "utf8");
    expect(route).toMatch(/searchParams\.get\("status"\)/);
    expect(route).toMatch(/searchParams\.get\("sort"\)/);
  });
});
