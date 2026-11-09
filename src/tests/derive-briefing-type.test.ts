import { describe, it, expect, vi } from "vitest";

// sync.ts imports the service-role Supabase client and the briefings reader; neither is
// exercised by the pure derivation, so stub both to keep this test hermetic.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/briefings-source", () => ({ fetchShelfBriefings: async () => ({ briefings: [], lookups: {}, existingTypes: new Map() }) }));

import { deriveBriefingType, type TypeDerivationInput } from "@/lib/sync";

const placement = (over: Partial<TypeDerivationInput>): TypeDerivationInput => ({
  themes: [],
  domains: [],
  subdomains: [],
  ...over,
});

describe("deriveBriefingType (IDF placement)", () => {
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

  it("no entity key and no IDF placement ⇒ null (unplaced, not shelf-eligible)", () => {
    expect(deriveBriefingType(placement({}))).toBeNull();
    expect(deriveBriefingType(placement({ jurisdictionId: null, companyId: null, institutionId: null }))).toBeNull();
  });
});

describe("deriveBriefingType (entity keys — BL2-01, FDY-277)", () => {
  it("company_id ⇒ company (founder decision 1)", () => {
    expect(deriveBriefingType(placement({ companyId: "cmp_540df7f83845146f" }))).toBe("company");
  });

  it("institution_id also ⇒ company (the DB constraint accepts either key)", () => {
    expect(deriveBriefingType(placement({ institutionId: "inst_abc" }))).toBe("company");
  });

  it("jurisdiction_id ⇒ jurisdiction (founder decision 2), for states and countries alike", () => {
    expect(deriveBriefingType(placement({ jurisdictionId: "US-TX" }))).toBe("jurisdiction");
    expect(deriveBriefingType(placement({ jurisdictionId: "IE" }))).toBe("jurisdiction");
  });

  it("entity keys outrank IDF placement: a company brief filed under a Thread is still a company brief", () => {
    expect(deriveBriefingType(placement({ companyId: "cmp_1", themes: ["Capital"], subdomains: ["Neoclouds"] }))).toBe("company");
  });

  it("jurisdiction outranks company when both keys are present", () => {
    expect(deriveBriefingType(placement({ jurisdictionId: "US-VA", companyId: "cmp_1" }))).toBe("jurisdiction");
  });
});
