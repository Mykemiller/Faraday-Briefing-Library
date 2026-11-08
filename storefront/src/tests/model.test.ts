import { describe, expect, it } from "vitest";
import { applyFilters, filterHref, inferState, normalize, parseFilters, parseSources, sortNewestFirst, stateOptions } from "@/lib/model";
import { fixturesEnabled } from "@/lib/fixtures";
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
    expect(b.typeLabel).toBeNull();
    expect(b.tier).toBe("deep");
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

describe("state inference", () => {
  it.each([
    ["Loudoun County, VA", "VA"],
    ["West Virginia data center incentives", "WV"],
    ["Virginia siting", "VA"],
    ["Washington, D.C. permitting", "DC"],
    ["Texas Large-Load Interconnection", "TX"],
    ["Power Architecture of the Buildout", null],
    ["Equinix, Inc", null],
  ])("%s → %s", (title, want) => expect(inferState(title)).toBe(want));
});

describe("filters", () => {
  const list = [
    normalize(row({ id: "1", title: "Texas grid", tier: "standard" }))!,
    normalize(row({ id: "2", title: "Ohio permits", tier: "deep" }))!,
    normalize(row({ id: "3", title: "Theme", tier: "deep" }))!,
  ];
  it("parses and sanitises query params", () => {
    expect(parseFilters({ tier: "DEEP", state: "tx" })).toEqual({ tier: "deep", state: "TX" });
    expect(parseFilters({ tier: "x", state: "ZZ" })).toEqual({ tier: null, state: null });
    expect(parseFilters({ tier: ["profile", "deep"] }).tier).toBe("profile");
  });
  it("combines tier and state", () => {
    expect(applyFilters(list, { tier: "deep", state: null }).map((b) => b.id)).toEqual(["2", "3"]);
    expect(applyFilters(list, { tier: "deep", state: "OH" }).map((b) => b.id)).toEqual(["2"]);
  });
  it("offers only states that exist", () => {
    expect(stateOptions(list).map((o) => o.code)).toEqual(["OH", "TX"]);
  });
  it("builds clean hrefs", () => {
    expect(filterHref({ tier: null, state: null })).toBe("/");
    expect(filterHref({ tier: "deep", state: "TX" })).toBe("/?tier=deep&state=TX");
  });
});

describe("fixtures can never reach a deployment", () => {
  it("are off on Vercel and in production", () => {
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", NODE_ENV: "development" })).toBe(true);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", VERCEL: "1", NODE_ENV: "development" })).toBe(false);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "1", NODE_ENV: "production" })).toBe(false);
    expect(fixturesEnabled({})).toBe(false);
    expect(fixturesEnabled({ STOREFRONT_FIXTURES: "empty", VERCEL: "1" })).toBe(false);
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
