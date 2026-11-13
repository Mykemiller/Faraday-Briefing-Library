import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { briefingToCatalog, stripComingSoon } from "@/lib/shelf-map";
import type { BriefingRow, Lookups } from "@/lib/briefings-source";

const lookups: Lookups = {
  themes: new Map([["T1", "The Power Reckoning"]]),
  domains: new Map([["D1", "Energy"]]),
  subdomains: new Map([["S1", "Neoclouds"]]),
  companies: new Map([["C1", "Wolfspeed"]]),
};

const row = (over: Partial<BriefingRow> & { id: string }): BriefingRow => ({
  airtable_record_id: null,
  title: "A Briefing",
  status: "planned",
  tier: null,
  sector_id: null,
  thread_id: null,
  theme_tags: null,
  company_id: null,
  institution_id: null,
  jurisdiction_id: null,
  briefing_type: null,
  byline: null,
  hypothesis: null,
  contents: null,
  published_at: null,
  last_refreshed: null,
  updated_at: "2026-11-12T00:00:00Z",
  ...over,
});

describe("BL3-01 shelf mapping from public.briefings", () => {
  it("excludes retired, draft and qa", () => {
    for (const status of ["retired", "draft", "qa"]) {
      expect(briefingToCatalog(row({ id: "x", status, company_id: "C1" }), lookups)).toBeNull();
    }
  });

  it("maps planned → Coming Soon and published → Available", () => {
    expect(briefingToCatalog(row({ id: "a", company_id: "C1" }), lookups)?.status).toBe("Coming Soon");
    const pub = row({ id: "b", status: "published", company_id: "C1", published_at: "2026-11-01T00:00:00Z" });
    expect(briefingToCatalog(pub, lookups, null, new Date("2026-11-12"))?.status).toBe("Available");
  });

  it("keeps a future-dated published row off the shelf", () => {
    const pub = row({ id: "b", status: "published", company_id: "C1", published_at: "2027-01-01T00:00:00Z" });
    expect(briefingToCatalog(pub, lookups, null, new Date("2026-11-12"))).toBeNull();
  });

  it("maps all five types", () => {
    const t = (over: Partial<BriefingRow>) => briefingToCatalog(row({ id: "t", ...over }), lookups)?.briefingType;
    expect(t({ theme_tags: ["T1"] })).toBe("theater");
    expect(t({ sector_id: "D1" })).toBe("sector");
    expect(t({ thread_id: "S1" })).toBe("thread");
    expect(t({ company_id: "C1" })).toBe("company");
    expect(t({ jurisdiction_id: "US-TX" })).toBe("jurisdiction");
  });

  it("an explicit briefing_type wins; an unplaceable row is dropped, never defaulted", () => {
    expect(briefingToCatalog(row({ id: "e", briefing_type: "company", company_id: "C1", theme_tags: ["T1"] }), lookups)?.briefingType).toBe("company");
    expect(briefingToCatalog(row({ id: "u" }), lookups)).toBeNull();
  });

  it("strips a leading 'Coming Soon — ' defensively, keeps the slug stable", () => {
    expect(stripComingSoon("Coming Soon — Nutanix")).toBe("Nutanix");
    expect(stripComingSoon("Coming soon - Nutanix")).toBe("Nutanix");
    expect(stripComingSoon("Wolfspeed")).toBe("Wolfspeed");
    const c = briefingToCatalog(row({ id: "r1", airtable_record_id: "recABCDEF123", title: "Coming Soon — Wolfspeed", company_id: "C1" }), lookups)!;
    expect(c.title).toBe("Wolfspeed");
    expect(c.id).toBe("recABCDEF123");
    expect(c.slug).toBe("coming-soon-wolfspeed-abcdef");
  });

  it("excludes seed- fixtures", () => {
    expect(briefingToCatalog(row({ id: "u", airtable_record_id: "seed-1", company_id: "C1" }), lookups)).toBeNull();
  });
});

describe("BL3-01 /library path makes no anon/RPC call", () => {
  it("catalog.ts and shelf.ts use neither supabaseServer() nor rpc()", () => {
    for (const f of ["src/lib/catalog.ts", "src/lib/shelf.ts", "src/lib/shelf-map.ts"]) {
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/supabaseServer\s*\(/);
      expect(src, f).not.toMatch(/\.rpc\s*\(/);
      expect(src, f).not.toMatch(/from\(["']library_catalog_cache["']\)\s*\.select\(["']\*/);
    }
  });
});
