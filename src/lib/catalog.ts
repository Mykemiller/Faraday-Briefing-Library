import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SHELF_PAGE_SIZE } from "@/config/constants";
import type {
  CatalogBriefing,
  Facets,
  ShelfPage,
  ShelfQuery,
  FacetCount,
} from "@/lib/types";

/** Encode/decode the keyset cursor (go_live_date, id). */
export function encodeCursor(b: CatalogBriefing): string {
  return `${b.goLiveDate ?? "null"}|${b.id}`;
}

function mapRow(r: any): CatalogBriefing {
  return {
    id: r.id,
    slug: r.slug,
    title: r.briefing_title,
    description: r.briefing_description,
    status: r.status,
    canonicalFlag: r.canonical_flag,
    gammaUrl: r.gamma_url,
    gammaId: r.gamma_id,
    themes: r.themes ?? [],
    domains: r.domains ?? [],
    subdomains: r.subdomains ?? [],
    companies: r.companies ?? [],
    downloadCount: r.download_count ?? 0,
    goLiveDate: r.go_live_date,
    briefingType: r.briefing_type ?? "sector",
    byline: r.byline ?? "Gilbert",
    hypothesis: r.hypothesis ?? "",
    contents: Array.isArray(r.contents) ? r.contents : [],
    previewSlides: r.preview_slides ?? null,
  };
}

async function facetAxis(axis: string): Promise<FacetCount[]> {
  const sb = supabaseServer();
  const { data, error } = await sb.rpc("library_facets", { p_axis: axis });
  if (error) throw new Error(`facets(${axis}) failed: ${error.message}`);
  return (data as any[]).map((d) => ({ value: d.value, count: Number(d.count) }));
}

/** Live facet counts for all four axes (§5.2 — bound to live data, never literals). */
export async function getFacets(): Promise<Facets> {
  const [theme, domain, subdomain, company] = await Promise.all([
    facetAxis("theme"),
    facetAxis("domain"),
    facetAxis("subdomain"),
    facetAxis("company"),
  ]);
  return { theme, domain, subdomain, company };
}

/** One keyset page of the shelf, with facets + live availability counts. */
export async function getShelfPage(query: ShelfQuery): Promise<ShelfPage> {
  const sb = supabaseServer();
  const limit = SHELF_PAGE_SIZE;

  const { data, error } = await sb.rpc("library_search", {
    p_q: query.q ?? null,
    p_theme: query.theme ?? null,
    p_domain: query.domain ?? null,
    p_subdomain: query.subdomain ?? null,
    p_company: query.company ?? null,
    p_status: query.status && query.status !== "Owned" ? query.status : null,
    p_type: query.type ?? null,
    p_sort: query.sort ?? "newest",
    p_cursor: query.cursor ?? null,
    p_limit: limit + 1, // fetch one extra to compute nextCursor
  });
  if (error) throw new Error(`library_search failed: ${error.message}`);

  const rows = (data as any[]).map(mapRow);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;

  const [facets, counts] = await Promise.all([getFacets(), getAvailabilityCounts()]);

  return { items, nextCursor, facets, ...counts };
}

/** Live Available / Coming Soon counts for the cap guard and Blueprint (§11.3). */
export async function getAvailabilityCounts(): Promise<{ availableCount: number; comingSoonCount: number }> {
  const sb = supabaseServer();
  const [{ count: availableCount }, { count: comingSoonCount }] = await Promise.all([
    sb.from("library_catalog_cache").select("id", { count: "exact", head: true }).eq("status", "Available"),
    sb.from("library_catalog_cache").select("id", { count: "exact", head: true }).eq("status", "Coming Soon"),
  ]);
  return { availableCount: availableCount ?? 0, comingSoonCount: comingSoonCount ?? 0 };
}

/** A single briefing by slug, with the viewer's owned flag joined in (§11.3 owned overlay). */
export async function getBriefingBySlug(
  slug: string,
  subscriberId?: string
): Promise<CatalogBriefing | null> {
  const sb = supabaseServer();
  const { data, error } = await sb.from("library_catalog_cache").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`getBriefingBySlug failed: ${error.message}`);
  if (!data) return null;
  const briefing = mapRow(data);
  if (subscriberId) {
    const { data: ent } = await supabaseAdmin()
      .from("library_entitlements")
      .select("briefing_id")
      .eq("subscriber_id", subscriberId)
      .eq("briefing_id", briefing.id)
      .maybeSingle();
    briefing.owned = !!ent;
  }
  return briefing;
}
