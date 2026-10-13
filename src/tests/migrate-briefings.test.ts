import { describe, expect, it } from "vitest";
import {
  mapStatus,
  resolveRecord,
  violatesPublishedGuard,
  csv,
  type Registry,
  type SourceRecord,
} from "../../scripts/migrate-briefings";

const reg: Registry = {
  airtable: {
    domainRegistry: {
      recDomA0000000001: { name: "Power Architecture", domainId: "D2" },
      recDomB0000000001: { name: "Grid & Regulatory", domainId: "D3" },
      recDomZ0000000001: { name: "Gone", domainId: "D99" },
    },
    subdomainRegistry: {
      recSubA0000000001: "Interconnection Queue & Grid Access",
      recSubB0000000001: "Behind-the-Meter Generation (BYOP/BYOG)",
      recSubC0000000001: "Jurisdiction Posture Intelligence (JPS)",
    },
    themeRegistry: { recThmA0000000001: "The Power Reckoning", recThmB0000000001: "The Rack Revolution" },
    trackingCompanies: { recCoA00000000001: "Acme", recCoB00000000001: "Beta", recCoZ00000000001: "Ghost" },
  },
  supabase: {
    companiesByAirtableRecordId: { recCoA00000000001: "cmp_a", recCoB00000000001: "cmp_b" },
    faradayDomains: { D2: { name: "Power Architecture", active: true }, D3: { name: "Grid & Regulatory", active: true } },
    faradaySubdomains: {
      "D3.1": { name: "Interconnection Queue & Grid Access", active: true, domain: "D3" },
      "D2.2": { name: "BTM Strategy & Cross-Cutting Economics", active: true, domain: "D2" },
    },
    faradayThemes: { "T-001": { name: "The Power Reckoning", active: true } },
  },
  bl07ReviewedSubdomainMatches: { recBrief000000002: "D2.2" },
};

const rec = (id: string, fields: Record<string, unknown>): SourceRecord => ({ id, fields });

describe("BL-04 migrate-briefings", () => {
  it("maps the four Airtable statuses and refuses unknown ones", () => {
    expect(mapStatus("Live")).toBe("published");
    expect(mapStatus("Draft")).toBe("draft");
    expect(mapStatus("Coming Soon")).toBe("planned");
    expect(mapStatus({ name: "Retired" })).toBe("retired");
    expect(() => mapStatus("Available")).toThrow();
  });

  it("resolves company, sub-domain, domain and theme by key", () => {
    const r = resolveRecord(
      rec("recBrief000000001", {
        "Briefing Title": " Coming Soon — Interconnection Queue & Grid Access ",
        Status: "Draft",
        "Tracking Companies": ["recCoA00000000001"],
        "IDF Subdomain": [{ id: "recSubA0000000001", name: "x" }],
        "IDF Domain": ["recDomB0000000001"],
        "IDF Theme": ["recThmA0000000001"],
      }),
      reg,
    );
    expect(r.row).toMatchObject({
      title: "Coming Soon — Interconnection Queue & Grid Access",
      status: "draft",
      company_id: "cmp_a",
      thread_id: "D3.1",
      sector_id: "D3",
      theme_tags: ["T-001"],
      source_refs: null,
      published_at: null,
    });
    expect(r.unmatched).toEqual([]);
  });

  it("uses a BL-07 reviewed match only when the link name equals the title's sub-domain", () => {
    const ok = resolveRecord(
      rec("recBrief000000002", {
        "Briefing Title": "Coming Soon — Behind-the-Meter Generation (BYOP/BYOG)",
        Status: "Draft",
        "IDF Subdomain": ["recSubB0000000001"],
      }),
      reg,
    );
    expect(ok.row.thread_id).toBe("D2.2");
    expect(ok.resolution.thread).toBe("bl07_reviewed");

    const notReviewed = resolveRecord(
      rec("recBrief000000003", { "Briefing Title": "Coming Soon — Jurisdiction Posture Intelligence (JPS)", Status: "Draft", "IDF Subdomain": ["recSubC0000000001"] }),
      reg,
    );
    expect(notReviewed.row.thread_id).toBeNull();
    expect(notReviewed.unmatched[0].reason).toBe("no_exact_name_match");
  });

  it("never picks one of several links for a single-valued column", () => {
    const r = resolveRecord(
      rec("recBrief000000004", {
        "Briefing Title": "Two companies",
        Status: "Draft",
        "Tracking Companies": ["recCoA00000000001", "recCoB00000000001"],
        "IDF Domain": ["recDomA0000000001", "recDomB0000000001"],
      }),
      reg,
    );
    expect(r.row.company_id).toBeNull();
    expect(r.row.sector_id).toBeNull();
    expect(r.unmatched.map((u) => u.reason)).toEqual(Array(4).fill("multiple_links_single_column"));
  });

  it("records unresolvable links instead of guessing", () => {
    const r = resolveRecord(
      rec("recBrief000000005", {
        "Briefing Title": "Ghosts",
        Status: "Coming Soon",
        "Tracking Companies": ["recCoZ00000000001"],
        "IDF Domain": ["recDomZ0000000001"],
        "IDF Theme": ["recThmB0000000001"],
      }),
      reg,
    );
    expect(r.row).toMatchObject({ status: "planned", company_id: null, sector_id: null, theme_tags: [] });
    expect(r.unmatched.map((u) => [u.link_field, u.reason])).toEqual([
      ["Tracking Companies", "no_registry_row"],
      ["IDF Domain", "no_registry_row"],
      ["IDF Theme", "no_exact_name_match"],
    ]);
  });

  it("inventories attachments by host only and flags published rows without sources", () => {
    const r = resolveRecord(
      rec("recBrief000000006", {
        "Briefing Title": "Live one",
        Status: "Live",
        "Go live Date": "2026-10-01",
        Attachments: [{ id: "att1", filename: "a.pdf", size: 10, type: "application/pdf", url: "https://v5.airtableusercontent.com/x?sig=secret" }],
      }),
      reg,
    );
    expect(r.attachments[0].source_host).toBe("v5.airtableusercontent.com");
    expect(JSON.stringify(r.attachments)).not.toContain("secret");
    expect(r.row.published_at).toBe("2026-10-01T00:00:00Z");
    expect(violatesPublishedGuard(r.row)).toBe(true);
    expect(csv([{ a: 'x,"y"' }], ["a"])).toBe('a\n"x,""y"""\n');
  });
});
