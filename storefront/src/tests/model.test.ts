import { describe, expect, it } from "vitest";
import {
  BRIEFING_COLUMNS,
  BRIEFING_TYPES,
  TYPE_META,
  activeFilterLabel,
  applyFilters,
  filterHref,
  jurisdictionName,
  jurisdictionOptions,
  normalize,
  parseFilters,
  parseJurisdiction,
  parseSources,
  sortNewestFirst,
  typeCounts,
} from "@/lib/model";
import { FIXTURES, fixturesEnabled } from "@/lib/fixtures";
import { entityFor, clearedLogoCount } from "@/lib/entities";

const row = (o: Record<string, unknown> = {}) => ({ id: "00000000-0000-4000-8000-00000000000a", title: "A briefing", ...o });

describe("normalize", () => {
  it("drops rows without id or title", () => {
    expect(normalize({ title: "x" })).toBeNull();
    expect(normalize({ id: "x" })).toBeNull();
  });
  it("never prints internal codes or unknown types", () => {
    const b = normalize(row({ theme_tags: ["D3", "D7.2", "Power Architecture"], briefing_type: "keyplayer", tier: "DEEP" }))!;
    expect(b.themes).toEqual(["Power Architecture"]);
    expect(b.type).toBeNull();
    expect(b.typeLabel).toBeNull();
    expect(b.tier).toBe("deep");
  });
  it("labels the five public types and reads jurisdiction_id from the column", () => {
    for (const t of BRIEFING_TYPES) expect(normalize(row({ briefing_type: t }))!.typeLabel).toBe(TYPE_META[t].label);
    expect(normalize(row({ briefing_type: "Jurisdiction", jurisdiction_id: "us-tx" }))!).toMatchObject({ type: "jurisdiction", jurisdiction: "US-TX" });
    expect(normalize(row({ title: "Loudoun County, VA" }))!.jurisdiction).toBeNull(); // nothing is inferred from the title
  });
  it("reads exactly the explicit column list, including jurisdiction_id and briefing_type", () => {
    expect(BRIEFING_COLUMNS).toContain("jurisdiction_id");
    expect(BRIEFING_COLUMNS).toContain("briefing_type");
    expect(BRIEFING_COLUMNS).not.toContain("*");
  });
  it("rejects unknown tiers", () => {
    expect(normalize(row({ tier: "platinum" }))!.tier).toBeNull();
  });
});

describe("sources", () => {
  it("parses the standard.md shape, sorts by n, drops unsafe URLs", () => {
    const s = parseSources([
      { n: 2, title: "B", url: "javascript:alert(1)" },
      { n: 1, title: "A", url: "https://x.test", publisher: "P", published_at: "2026-10-12" },
      "junk",
      {},
    ]);
    expect(s.map((x) => x.n)).toEqual([1, 2]);
    expect(s[1].url).toBeNull();
    expect(s[0]).toMatchObject({ publisher: "P", date: "2026-10-12" });
  });
  it("tolerates a non-array", () => expect(parseSources({ a: 1 })).toEqual([]));
});

describe("ordering", () => {
  it("newest first, undated last, stable by id", () => {
    const list = [
      normalize(row({ id: "1", published_at: "2026-10-01T00:00:00Z" }))!,
      normalize(row({ id: "2", published_at: null }))!,
      normalize(row({ id: "3", published_at: "2026-11-01T00:00:00Z" }))!,
    ];
    expect(sortNewestFirst(list).map((b) => b.id)).toEqual(["3", "1", "2"]);
  });
});

describe("jurisdiction (briefings.jurisdiction_id, not the title)", () => {
  it.each([
    ["US-VA", "US-VA"],
    ["us-wv", "US-WV"],
    ["US-DC", "US-DC"],
    ["US-TX", "US-TX"],
    ["de", "DE"],
    ["GB", "GB"],
    ["US-ZZ", null], // not a state
    ["Texas", null], // a name, not an id
    ["USA", null],
    ["", null],
    [null, null],
    [42, null],
  ])("%s → %s", (raw, want) => expect(parseJurisdiction(raw)).toBe(want));

  it("names a state or a country, never an internal code", () => {
    expect(jurisdictionName("US-TX")).toBe("Texas");
    expect(jurisdictionName("US-DC")).toBe("District of Columbia");
    expect(jurisdictionName("DE")).toBe("Germany");
    expect(jurisdictionName("GB")).toBe("United Kingdom");
  });
});

describe("filters", () => {
  const list = [
    normalize(row({ id: "1", title: "Texas", tier: "standard", briefing_type: "jurisdiction", jurisdiction_id: "US-TX" }))!,
    normalize(row({ id: "2", title: "Ohio", tier: "deep", briefing_type: "jurisdiction", jurisdiction_id: "US-OH" }))!,
    normalize(row({ id: "3", title: "Theme", tier: "deep", briefing_type: "theater" }))!,
    normalize(row({ id: "4", title: "Germany", tier: "standard", briefing_type: "jurisdiction", jurisdiction_id: "DE" }))!,
    normalize(row({ id: "5", title: "Acme", tier: "profile", briefing_type: "company", company_id: "cmp_1" }))!,
  ];
  it("parses and sanitises query params", () => {
    expect(parseFilters({ tier: "DEEP", type: "Jurisdiction", jurisdiction: "us-tx" })).toEqual({ tier: "deep", type: "jurisdiction", jurisdiction: "US-TX" });
    expect(parseFilters({ tier: "x", type: "keyplayer", jurisdiction: "Texas" })).toEqual({ tier: null, type: null, jurisdiction: null });
    expect(parseFilters({ tier: ["profile", "deep"], type: ["thread", "sector"] })).toMatchObject({ tier: "profile", type: "thread" });
  });
  it("keeps ?state=XX working as an alias for ?jurisdiction=US-XX", () => {
    expect(parseFilters({ state: "tx" }).jurisdiction).toBe("US-TX");
    expect(parseFilters({ state: "TX", jurisdiction: "DE" }).jurisdiction).toBe("DE");
    expect(parseFilters({ state: "ZZ" }).jurisdiction).toBeNull();
  });
  it("combines type, tier and jurisdiction", () => {
    const f = (o: Partial<ReturnType<typeof parseFilters>>) => applyFilters(list, { tier: null, type: null, jurisdiction: null, ...o }).map((b) => b.id);
    expect(f({ type: "jurisdiction" })).toEqual(["1", "2", "4"]);
    expect(f({ type: "jurisdiction", tier: "deep" })).toEqual(["2"]);
    expect(f({ jurisdiction: "DE" })).toEqual(["4"]);
    expect(f({ type: "company", jurisdiction: "DE" })).toEqual([]);
    expect(f({ tier: "deep" })).toEqual(["2", "3"]);
  });
  it("counts each type and offers only jurisdictions that exist, states before countries", () => {
    expect(typeCounts(list)).toEqual({ theater: 1, sector: 0, thread: 0, company: 1, jurisdiction: 3 });
    expect(jurisdictionOptions(list)).toEqual([
      { id: "US-OH", name: "Ohio", count: 1, group: "us" },
      { id: "US-TX", name: "Texas", count: 1, group: "us" },
      { id: "DE", name: "Germany", count: 1, group: "country" },
    ]);
  });
  it("builds clean hrefs and a human label", () => {
    expect(filterHref({ tier: null, type: null, jurisdiction: null })).toBe("/");
    expect(filterHref({ tier: "deep", type: "jurisdiction", jurisdiction: "US-TX" })).toBe("/?type=jurisdiction&tier=deep&jurisdiction=US-TX");
    expect(activeFilterLabel({ tier: "deep", type: "jurisdiction", jurisdiction: "US-TX" })).toBe("Jurisdiction Briefings · Deep · Texas");
    expect(activeFilterLabel({ tier: null, type: null, jurisdiction: null })).toBe("");
  });
  it("shelf labels are the Brand Bible public vocabulary, no internal keys", () => {
    expect(BRIEFING_TYPES.map((t) => TYPE_META[t].shelf)).toEqual([
      "Theater Briefings",
      "Sector Briefings",
      "Thread Briefings",
      "Company Briefings",
      "Jurisdiction Briefings",
    ]);
  });
});

describe("fixtures never reach a production deployment", () => {
  it("are on locally and on a Vercel PREVIEW that opts in, off everywhere else", () => {
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", NODE_ENV: "development" })).toBe(true);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", VERCEL: "1", NODE_ENV: "development" })).toBe(false); // no VERCEL_ENV ⇒ refuse
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", NODE_ENV: "production" })).toBe(false);
    expect(fixturesEnabled({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe(false); // nothing without the opt-in
    expect(fixturesEnabled({})).toBe(false);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "empty", VERCEL: "1", VERCEL_ENV: "production" })).toBe(false);
  });
  it("cover all five public types plus a US state and a country jurisdiction", () => {
    expect(new Set(FIXTURES.map((b) => b.type))).toEqual(new Set(BRIEFING_TYPES));
    expect(FIXTURES.filter((b) => b.jurisdiction).map((b) => b.jurisdiction).sort()).toEqual(["DE", "US-VA"]);
    for (const b of FIXTURES) expect(b.title.startsWith("Sample")).toBe(true);
  });
});

describe("BL-11 logo register", () => {
  it("shows no logo that the register has not cleared", () => {
    // Register on main: 0 approved / 200 excluded.
    expect(clearedLogoCount()).toBe(0);
    expect(entityFor("cmp_471d41bfea8b0180")).toMatchObject({ logo: null });
    expect(entityFor("cmp_471d41bfea8b0180")!.name.length).toBeGreaterThan(0);
    expect(entityFor("nope")).toBeNull();
  });
});

describe("dates", () => {
  it("never shifts a calendar date by a day", async () => {
    const { formatDate } = await import("@/lib/model");
    expect(formatDate("2026-10-12", "short")).toBe("Oct 12, 2026");
    expect(formatDate("2026-11-04T03:00:00Z")).toBe("November 3, 2026"); // 9 PM Central on Nov 3
    expect(formatDate(null)).toBe("");
    expect(formatDate("garbage")).toBe("");
  });
});
