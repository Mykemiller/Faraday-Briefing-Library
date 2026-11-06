import { supabaseAdmin } from "@/lib/supabase/admin";
import { BRIEFINGS_SOURCE } from "@/config/constants";

/**
 * BL-05 cutover (FDY-171, DEC-IDF-65): `public.briefings` is the canonical home of the Briefing
 * Library. This module is the ONLY reader the catalog sync has — the Airtable table
 * (appxfti7VuoHYUeu6 / tbl4kbby85nx6Z891) is retired and never read by the storefront.
 *
 * Everything here is a plain service-role SELECT. Nothing writes.
 */

/** The `briefings` columns the sync reads (BL-03 schema + the FDY-181 editorial columns). */
export interface BriefingRow {
  id: string; // uuid
  airtable_record_id: string | null; // migration trail; doubles as the cache id when present
  title: string;
  status: string; // planned | draft | qa | published | retired
  tier: string | null;
  sector_id: string | null; // faraday_domains.domain_code
  thread_id: string | null; // faraday_subdomains.subdomain_code
  theme_tags: string[] | null; // faraday_themes.theme_code[]
  company_id: string | null; // companies.company_uid
  institution_id: string | null;
  briefing_type: string | null; // FDY-181: theater | sector | thread
  byline: string | null; // FDY-181: Gilbert | Mach
  hypothesis: string | null; // FDY-181
  contents: string[] | null; // FDY-181
  published_at: string | null;
  last_refreshed: string | null;
  updated_at: string;
}

/** Code → display-name maps. The cache stores NAMES in its facet arrays (what the shelf renders). */
export interface Lookups {
  themes: Map<string, string>; // theme_code → name
  domains: Map<string, string>; // domain_code → domain_name
  subdomains: Map<string, string>; // subdomain_code → display_name
  companies: Map<string, string>; // company_uid → canonical_name
}

export interface ShelfSource {
  briefings: BriefingRow[];
  lookups: Lookups;
  /** Existing cache id → briefing_type, so a row with no placement keeps its type instead of churning. */
  existingTypes: Map<string, string>;
}

export const BRIEFING_SELECT =
  "id,airtable_record_id,title,status,tier,sector_id,thread_id,theme_tags,company_id,institution_id," +
  "briefing_type,byline,hypothesis,contents,published_at,last_refreshed,updated_at";

const PAGE = 1000;

async function selectAll<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Read every shelf-candidate briefing (status ∈ keys of BRIEFINGS_SOURCE.shelfStatuses) plus the
 * lookups needed to render facet names. Nothing in draft/qa/retired is ever selected, so nothing
 * unpublished can leak into the read-model (§11.3 holds at the SOURCE, not only at the mapper).
 */
export async function fetchShelfBriefings(): Promise<ShelfSource> {
  const sb = supabaseAdmin();
  const statuses = Object.keys(BRIEFINGS_SOURCE.shelfStatuses);

  const briefings = await selectAll<BriefingRow>((from, to) =>
    sb.from(BRIEFINGS_SOURCE.table).select(BRIEFING_SELECT).in("status", statuses).order("id").range(from, to) as any,
  );

  const [themes, domains, subdomains, existing] = await Promise.all([
    selectAll<{ theme_code: string; name: string }>((from, to) =>
      sb.from("faraday_themes").select("theme_code,name").order("theme_code").range(from, to) as any),
    selectAll<{ domain_code: string; domain_name: string }>((from, to) =>
      sb.from("faraday_domains").select("domain_code,domain_name").order("domain_code").range(from, to) as any),
    selectAll<{ subdomain_code: string; display_name: string }>((from, to) =>
      sb.from("faraday_subdomains").select("subdomain_code,display_name").order("subdomain_code").range(from, to) as any),
    selectAll<{ id: string; briefing_type: string | null }>((from, to) =>
      sb.from("library_catalog_cache").select("id,briefing_type").order("id").range(from, to) as any),
  ]);

  // Companies: only the uids this load references (the table holds ~6.7k rows).
  const uids = [...new Set(briefings.map((b) => b.company_id).filter((u): u is string => !!u))];
  const companies = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 200) {
    const { data, error } = await sb
      .from("companies")
      .select("company_uid,canonical_name")
      .in("company_uid", uids.slice(i, i + 200));
    if (error) throw new Error(`companies lookup failed: ${error.message}`);
    for (const c of data ?? []) companies.set(c.company_uid, c.canonical_name);
  }

  return {
    briefings,
    lookups: {
      themes: new Map(themes.map((t) => [t.theme_code, t.name])),
      domains: new Map(domains.map((d) => [d.domain_code, d.domain_name])),
      subdomains: new Map(subdomains.map((s) => [s.subdomain_code, s.display_name])),
      companies,
    },
    existingTypes: new Map(existing.map((e) => [e.id, e.briefing_type ?? ""])),
  };
}
