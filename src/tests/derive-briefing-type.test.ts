import { describe, it, expect, vi } from "vitest";

// sync.ts imports the service-role Supabase client and the Airtable fetcher; neither is
// exercised by the pure derivation, so stub both to keep this test hermetic.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/airtable", () => ({
  fetchShelfRecords: async () => [],
  names: () => [],
  singleName: () => null,
}));

import { deriveBriefingType } from "@/lib/sync";

const placement = (over: Partial<{ themes: string[]; domains: string[]; subdomains: string[] }>) => ({
  themes: [],
  domains: [],
  subdomains: [],
  ...over,
});

describe("deriveBriefingType (IDF placement only)", () => {
  it("subdomain ⇒ thread, even with a domain and theme present", () => {
    expect(
      deriveBriefingType(placement({ themes: ["Capital"], domains: ["New Entrants"], subdomains: ["Neoclouds"] })),
    ).toBe("thread");
  });

  it("domain without subdomain ⇒ sector", () => {
    expect(deriveBriefingType(placement({ themes: ["Capital"], domains: ["New Entrants"] }))).toBe("sector");
  });

  it("theme only ⇒ theater", () => {
    expect(deriveBriefingType(placement({ themes: ["The Power Reckoning"] }))).toBe("theater");
  });

  it("no IDF placement ⇒ null (unplaced, not shelf-eligible)", () => {
    expect(deriveBriefingType(placement({}))).toBeNull();
  });

  it("a Tracking Companies link never decides the type", () => {
    const withCompany = { ...placement({}), companies: ["CoreWeave"] };
    expect(deriveBriefingType(withCompany)).toBeNull();
    const themedWithCompany = { ...placement({ themes: ["Capital"] }), companies: ["CoreWeave"] };
    expect(deriveBriefingType(themedWithCompany)).toBe("theater");
  });
});
