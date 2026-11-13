import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { TYPE_CHIPS, SHELF_GROUPS } from "@/lib/brand";
import { BRIEFING_TYPES } from "@/config/constants";
import { search } from "@/lib/catalog-model";
import { FacetRail } from "@/components/FacetRail";
import { LibraryShell } from "@/components/LibraryShell";
import {
  buildTheaterList,
  isTheaterRow,
  loadTheaters,
  type ThemeRow,
  type TheaterBriefingRow,
  type TheaterSourceClient,
} from "@/lib/theaters";
import type { CatalogBriefing, ShelfPage } from "@/lib/types";

/** The seven faraday_themes rows (docs/briefs/entity-universe-method.md: 7, all active). */
const THEMES: ThemeRow[] = [
  { theme_code: "T1", name: "The Power Reckoning", active: true },
  { theme_code: "T2", name: "The Thermal Reckoning", active: true },
  { theme_code: "T3", name: "The Consent Crisis", active: true },
  { theme_code: "T4", name: "Capital Concentration", active: true },
  { theme_code: "T5", name: "The Inference Economy", active: true },
  { theme_code: "T6", name: "The Sovereign AI Race", active: true },
  { theme_code: "T7", name: "The New Energy Stack", active: true },
];

const theaterRow = (over: Partial<TheaterBriefingRow> & { id: string }): TheaterBriefingRow => ({
  title: null,
  theme_tags: null,
  briefing_type: "theater",
  published_at: null,
  ...over,
});

/** One theater briefing per theme; titles + dates fix the "theater row order". */
const THEATER_ROWS: TheaterBriefingRow[] = [
  theaterRow({ id: "b5", title: "The Inference Economy", theme_tags: ["T5"], published_at: "2026-07-01T00:00:00Z" }),
  theaterRow({ id: "b1", title: "The Power Reckoning", theme_tags: ["T1"], published_at: "2026-06-01T00:00:00Z" }),
  theaterRow({ id: "b2", title: "The Thermal Reckoning", theme_tags: ["T2"] }),
  theaterRow({ id: "b3", title: "The Consent Crisis", theme_tags: ["T3"] }),
  theaterRow({ id: "b4", title: "Capital Concentration", theme_tags: ["T4"] }),
  theaterRow({ id: "b6", title: "The Sovereign AI Race", theme_tags: ["T6"] }),
  theaterRow({ id: "b7", title: "The New Energy Stack", theme_tags: ["T7"] }),
];

/** Stub Supabase client: serves canned rows per table and records every builder call. */
function stubClient(tables: Record<string, unknown[]>, failOn?: string) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const client = {
    from(table: string) {
      const rec = (op: string, ...args: unknown[]) => calls.push({ table, op, args });
      const builder: any = {
        select: (cols: string) => (rec("select", cols), builder),
        not: (...a: unknown[]) => (rec("not", ...a), builder),
        in: (...a: unknown[]) => (rec("in", ...a), builder),
        eq: (...a: unknown[]) => (rec("eq", ...a), builder),
        order: (c: string) => (rec("order", c), builder),
        range: (from: number, to: number) => {
          rec("range", from, to);
          if (failOn === table) return Promise.resolve({ data: null, error: { message: `${table} unavailable` } });
          return Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as TheaterSourceClient, calls };
}

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

describe("BL3-02 type chips: All + five types", () => {
  it("are All, Theater, Sector, Thread, Company, Jurisdiction — in SHELF_GROUPS order", () => {
    expect(TYPE_CHIPS.map((c) => c.label)).toEqual(["All", "Theater", "Sector", "Thread", "Company", "Jurisdiction"]);
    expect(TYPE_CHIPS.map((c) => c.key)).toEqual(["all", ...SHELF_GROUPS.map((g) => g.type)]);
    expect(TYPE_CHIPS.slice(1).map((c) => c.key)).toEqual([...BRIEFING_TYPES]);
  });

  it("each type chip filters via `type`", () => {
    const rows = BRIEFING_TYPES.map((t) => card({ id: `x-${t}`, briefingType: t }));
    for (const { key } of TYPE_CHIPS) {
      const { items } = search(rows, { type: key === "all" ? undefined : key, limit: 50 });
      expect(items.map((b) => b.briefingType), key).toEqual(key === "all" ? expect.arrayContaining([...BRIEFING_TYPES]) : [key]);
    }
  });

  it("the shelf renders six chip buttons, count-free", () => {
    const initial: ShelfPage = { items: [], nextCursor: null, facets: { theme: [], domain: [], subdomain: [], company: [] }, availableCount: 0, comingSoonCount: 0 };
    const html = renderToStaticMarkup(createElement(LibraryShell, { initial, theaters: THEMES.map((t) => t.name) }));
    const main = html.slice(html.indexOf("<main"));
    const chips = [...main.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    expect(chips).toEqual(["All", "Theater", "Sector", "Thread", "Company", "Jurisdiction"]);
    expect(chips.join(" ")).not.toMatch(/\d/);
  });

  it("the catalog API accepts every chip type", () => {
    const route = readFileSync("src/app/api/library/catalog/route.ts", "utf8");
    expect(route).toMatch(/BRIEFING_TYPES\.includes/);
  });
});

describe("BL3-02 sidebar theaters from data, status-independent", () => {
  it("lists every faraday_themes theme once, in theater row order", () => {
    const list = buildTheaterList(THEMES, THEATER_ROWS);
    expect(list).toHaveLength(THEMES.length); // theater list length = number of theater rows
    expect(list).toEqual([
      "The Power Reckoning", // dated 2026-06
      "The Inference Economy", // dated 2026-07
      "Capital Concentration", // undated: by title
      "The Consent Crisis",
      "The New Energy Stack",
      "The Sovereign AI Race",
      "The Thermal Reckoning",
    ]);
  });

  it("does not depend on briefing status: no theater briefs at all still yields all 7", () => {
    expect(buildTheaterList(THEMES, [])).toHaveLength(7);
    expect(new Set(buildTheaterList(THEMES, THEATER_ROWS.slice(0, 2)))).toEqual(new Set(THEMES.map((t) => t.name)));
  });

  it("ignores non-theater rows for order, dedupes names, skips inactive and unknown codes", () => {
    const rows = [
      theaterRow({ id: "s", briefing_type: "sector", theme_tags: ["T7"], published_at: "2020-01-01T00:00:00Z" }),
      theaterRow({ id: "u", briefing_type: null, theme_tags: ["T6"], sector_id: "D1" }), // derives sector
      theaterRow({ id: "d", briefing_type: null, theme_tags: ["T6", "T6", "TX"], published_at: "2026-01-01T00:00:00Z" }), // derives theater
    ];
    expect(isTheaterRow(rows[0])).toBe(false);
    expect(isTheaterRow(rows[1])).toBe(false);
    expect(isTheaterRow(rows[2])).toBe(true);
    const themes = [...THEMES, { theme_code: "T8", name: "Retired Arena", active: false }];
    const list = buildTheaterList(themes, rows);
    expect(list[0]).toBe("The Sovereign AI Race");
    expect(list).toHaveLength(7);
    expect(list).not.toContain("Retired Arena");
  });

  it("loadTheaters reads faraday_themes + briefings with no status filter", async () => {
    const { client, calls } = stubClient({ faraday_themes: THEMES, briefings: THEATER_ROWS });
    const list = await loadTheaters(client);
    expect(list).toHaveLength(7);
    expect(list[0]).toBe("The Power Reckoning");
    expect(calls.filter((c) => c.op === "select").map((c) => c.table).sort()).toEqual(["briefings", "faraday_themes"]);
    const statusFilters = calls.filter((c) => (c.op === "in" || c.op === "eq") && c.args[0] === "status");
    expect(statusFilters).toEqual([]);
  });

  it("loadTheaters surfaces a read error to the caller", async () => {
    const { client } = stubClient({ faraday_themes: THEMES, briefings: [] }, "faraday_themes");
    await expect(loadTheaters(client)).rejects.toThrow(/faraday_themes unavailable/);
  });

  it("the sidebar renders one item per theater, names only", () => {
    const theaters = buildTheaterList(THEMES, THEATER_ROWS);
    const html = renderToStaticMarkup(createElement(FacetRail, { theaters, navKey: "all", onNav: () => {} }));
    const section = html.slice(html.indexOf(">Theaters<"), html.indexOf(">Your Shelf<"));
    const items = [...section.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);
    expect(items).toEqual(theaters);
    expect(items).toHaveLength(7);
  });
});

describe("BL3-02 getTheaters wiring", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the data read, and degrades to shelf theater cards when it fails", async () => {
    vi.doMock("@/lib/theaters", () => ({ loadTheaters: vi.fn().mockRejectedValue(new Error("down")) }));
    vi.doMock("@/lib/shelf", () => ({
      loadShelf: vi.fn().mockResolvedValue([
        card({ id: "a", briefingType: "theater", themes: ["The Power Reckoning"] }),
        card({ id: "b", briefingType: "company", themes: ["Ignored"] }),
      ]),
    }));
    const { getTheaters } = await import("@/lib/catalog");
    expect(await getTheaters()).toEqual(["The Power Reckoning"]);

    vi.resetModules();
    vi.doMock("@/lib/theaters", () => ({ loadTheaters: vi.fn().mockResolvedValue(THEMES.map((t) => t.name)) }));
    const again = await import("@/lib/catalog");
    expect(await again.getTheaters()).toHaveLength(7);
    vi.doUnmock("@/lib/theaters");
    vi.doUnmock("@/lib/shelf");
  });

  it("theaters.ts makes no anon or RPC call", () => {
    const src = readFileSync("src/lib/theaters.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).not.toMatch(/supabaseServer\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
  });
});
