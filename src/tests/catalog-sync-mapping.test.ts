import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/briefings-source", () => ({ fetchShelfBriefings: async () => ({ briefings: [], lookups: {}, existingTypes: new Map() }) }));

import { toCacheRow, shelfStatusFor, cacheIdFor } from "@/lib/sync";
import type { BriefingRow, Lookups } from "@/lib/briefings-source";

const lookups: Lookups = {
  themes: new Map([["T-001", "The Power Reckoning"]]),
  domains: new Map([["D4", "Capital & Deal Flow"]]),
  subdomains: new Map([["D3.1", "Interconnection Queue & Grid Access"]]),
  companies: new Map([["cmp_540df7f83845146f", "NVIDIA"]]),
};

const base: BriefingRow = {
  id: "0f1e2d3c-0000-4000-8000-000000000001",
  airtable_record_id: "recaSn1AEEHf85c2q",
  title: "Coming Soon — NVIDIA",
  status: "planned",
  tier: null,
  sector_id: null,
  thread_id: null,
  theme_tags: [],
  company_id: "cmp_540df7f83845146f",
  institution_id: null,
  briefing_type: null,
  byline: null,
  hypothesis: null,
  contents: null,
  published_at: null,
  last_refreshed: null,
  updated_at: "2026-11-06T20:29:05Z",
};
const NOW = new Date("2026-11-06T21:00:00Z");

describe("BL-05: briefings → library_catalog_cache mapping", () => {
  it("planned ⇒ Coming Soon, keyed on the Airtable record id, company name resolved", () => {
    const r = toCacheRow(base, lookups, "theater", NOW)!;
    expect(r.row.id).toBe("recaSn1AEEHf85c2q");
    expect(r.row.status).toBe("Coming Soon");
    expect(r.row.companies).toEqual(["NVIDIA"]);
    expect(r.row.slug).toBe("coming-soon-nvidia-asn1ae");
    expect(r.row.go_live_date).toBeNull();
  });

  it("a company-only placeholder keeps the cache's existing type (no churn) and is counted unplaced", () => {
    const r = toCacheRow(base, lookups, "theater", NOW)!;
    expect(r.placed).toBe(false);
    expect(r.row.briefing_type).toBe("theater");
    expect(r.row.byline).toBe("Mach");
    // brand-new row with no placement and no explicit type ⇒ the column default
    expect(toCacheRow(base, lookups, undefined, NOW)!.row.briefing_type).toBe("sector");
  });

  it("an explicit briefings.briefing_type / byline always wins over the derivation", () => {
    const r = toCacheRow({ ...base, theme_tags: ["T-001"], briefing_type: "thread", byline: "Mach" }, lookups, "theater", NOW)!;
    expect(r.row.briefing_type).toBe("thread");
    expect(r.row.byline).toBe("Mach");
    expect(r.placed).toBe(true);
  });

  it("IDF placement derives the type and resolves names (sub-domain ⇒ thread beats domain ⇒ sector)", () => {
    const r = toCacheRow({ ...base, sector_id: "D4", thread_id: "D3.1", theme_tags: ["T-001"] }, lookups, undefined, NOW)!;
    expect(r.row.briefing_type).toBe("thread");
    expect(r.row.byline).toBe("Gilbert");
    expect(r.row.themes).toEqual(["The Power Reckoning"]);
    expect(r.row.domains).toEqual(["Capital & Deal Flow"]);
    expect(r.row.subdomains).toEqual(["Interconnection Queue & Grid Access"]);
    // an unknown code is carried verbatim rather than dropped
    expect(toCacheRow({ ...base, sector_id: "D99" }, lookups, undefined, NOW)!.row.domains).toEqual(["D99"]);
  });

  it("published ⇒ Available with go_live_date = published_at::date; a future publish stays off the shelf", () => {
    const pub = { ...base, status: "published", published_at: "2026-11-01T12:00:00Z", theme_tags: ["T-001"] };
    const r = toCacheRow(pub, lookups, undefined, NOW)!;
    expect(r.row.status).toBe("Available");
    expect(r.row.go_live_date).toBe("2026-11-01");
    expect(r.row.briefing_type).toBe("theater");
    expect(r.row.byline).toBe("Mach");
    expect(shelfStatusFor({ status: "published", published_at: "2027-01-01T00:00:00Z" }, NOW)).toBeNull();
  });

  it("draft / qa / retired never reach the shelf", () => {
    for (const status of ["draft", "qa", "retired"]) {
      expect(toCacheRow({ ...base, status }, lookups, undefined, NOW)).toBeNull();
    }
  });

  it("FDY-181 editorial columns flow through; a native (non-Airtable) briefing is keyed on its uuid", () => {
    const native = { ...base, airtable_record_id: null, hypothesis: "Power is the constraint.", contents: ["One", "Two"] };
    const r = toCacheRow(native, lookups, undefined, NOW)!;
    expect(cacheIdFor(native)).toBe(native.id);
    expect(r.row.id).toBe(native.id);
    expect(r.row.hypothesis).toBe("Power is the constraint.");
    expect(r.row.contents).toEqual(["One", "Two"]);
  });

  it("never emits the columns other writers own", () => {
    const r = toCacheRow(base, lookups, "theater", NOW)!.row as unknown as Record<string, unknown>;
    for (const col of ["download_count", "preview_slides", "preview_hash", "briefing_description", "gamma_url", "gamma_id", "canonical_flag"]) {
      expect(col in r).toBe(false);
    }
  });
});
