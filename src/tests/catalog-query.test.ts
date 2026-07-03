import { describe, it, expect } from "vitest";
import { search, computeFacets } from "@/lib/catalog-model";
import type { CatalogBriefing } from "@/lib/types";

const b = (over: Partial<CatalogBriefing> & { id: string }): CatalogBriefing => ({
  slug: `${over.id}-slug`,
  title: "Untitled",
  description: "",
  status: "Available",
  canonicalFlag: "Canonical",
  gammaUrl: null,
  gammaId: null,
  themes: [],
  domains: [],
  subdomains: [],
  companies: [],
  downloadCount: 0,
  goLiveDate: null,
  briefingType: "sector",
  byline: "Gilbert",
  hypothesis: "",
  contents: [],
  previewSlides: null,
  ...over,
});

const rows: CatalogBriefing[] = [
  b({ id: "rec1", title: "CoreWeave Power Architecture", description: "GPU clouds and grid", themes: ["Power Architecture"], domains: ["Energy"], companies: ["CoreWeave"], goLiveDate: "2026-06-01", downloadCount: 12 }),
  b({ id: "rec2", title: "Equinix Capital Markets", description: "REIT financing", themes: ["Capital Markets"], domains: ["Finance"], companies: ["Equinix"], goLiveDate: "2026-06-10", downloadCount: 30 }),
  b({ id: "rec3", title: "EQT Liquid Cooling", description: "Direct-to-chip cooling thesis", themes: ["Power Architecture"], domains: ["Energy"], companies: ["EQT"], goLiveDate: "2026-06-05", downloadCount: 5 }),
  b({ id: "rec4", title: "Forthcoming Monograph", description: "placeholder", status: "Coming Soon", domains: ["Energy"], companies: ["Engineered Fluids"] }),
  b({ id: "rec5", title: "CoreWeave", description: "key player dossier", briefingType: "keyplayer", companies: ["CoreWeave"], goLiveDate: "2026-06-12" }),
  b({ id: "rec6", title: "The Power Reckoning", description: "theater thesis", briefingType: "theater", themes: ["The Power Reckoning"], goLiveDate: "2026-06-20" }),
];

describe("FTS + facets + keyset (L1, L7, §11.2)", () => {
  it("full-text matches title and description (AND semantics)", () => {
    expect(search(rows, { q: "cooling", limit: 10 }).items.map((r) => r.id)).toEqual(["rec3"]);
    expect(search(rows, { q: "power grid", limit: 10 }).items.map((r) => r.id)).toEqual(["rec1"]);
    expect(search(rows, { q: "nonexistent", limit: 10 }).items).toHaveLength(0);
  });

  it("intersects facet filters", () => {
    const r = search(rows, { theme: "Power Architecture", company: "EQT", limit: 10 });
    expect(r.items.map((x) => x.id)).toEqual(["rec3"]);
  });

  it("computes Available-only facet counts, bound to live rows (§5.2)", () => {
    const themes = computeFacets(rows, "theme");
    expect(themes).toContainEqual({ value: "Power Architecture", count: 2 });
    expect(themes).toContainEqual({ value: "Capital Markets", count: 1 });
    // Coming-Soon rec4 (Energy domain) must NOT inflate Available facet counts.
    const domains = computeFacets(rows, "domain");
    expect(domains.find((d) => d.value === "Energy")?.count).toBe(2);
  });

  it("paginates by keyset (go_live_date desc, id desc) without overlap or gaps", () => {
    const avail = rows.slice(0, 4).filter((r) => r.status === "Available");
    const p1 = search(avail, { sort: "newest", limit: 2 });
    expect(p1.items.map((r) => r.id)).toEqual(["rec2", "rec3"]); // 06-10, then 06-05
    expect(p1.nextCursor).toBe("2026-06-05|rec3");
    const p2 = search(avail, { sort: "newest", limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((r) => r.id)).toEqual(["rec1"]); // 06-01
    expect(p2.nextCursor).toBeNull();
    // No id appears on both pages.
    const ids = [...p1.items, ...p2.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters by briefing_type (library_search p_type, FBL 1.0)", () => {
    expect(search(rows, { type: "keyplayer", limit: 10 }).items.map((x) => x.id)).toEqual(["rec5"]);
    expect(search(rows, { type: "theater", limit: 10 }).items.map((x) => x.id)).toEqual(["rec6"]);
    // p_type intersects with the other filters (chip × search × facet semantics).
    expect(search(rows, { type: "sector", q: "cooling", limit: 10 }).items.map((x) => x.id)).toEqual(["rec3"]);
    expect(search(rows, { type: "keyplayer", q: "cooling", limit: 10 }).items).toHaveLength(0);
    // null/undefined type = all types (back-compat with pre-1.0 callers).
    expect(search(rows, { limit: 10 }).items.length).toBe(rows.length);
  });

  it("sorts most-downloaded", () => {
    const r = search(rows.slice(0, 4).filter((x) => x.status === "Available"), { sort: "downloads", limit: 10 });
    expect(r.items.map((x) => x.id)).toEqual(["rec2", "rec1", "rec3"]);
  });
});
