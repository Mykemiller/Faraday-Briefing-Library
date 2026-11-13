import { loadShelf } from "@/lib/shelf";
import { search, computeFacets } from "@/lib/catalog-model";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SHELF_PAGE_SIZE } from "@/config/constants";
import type {
  CatalogBriefing,
  Facets,
  ShelfPage,
  ShelfQuery,
} from "@/lib/types";

/** Encode/decode the keyset cursor (go_live_date, id). */
export function encodeCursor(b: CatalogBriefing): string {
  return `${b.goLiveDate ?? "null"}|${b.id}`;
}

/** Facet counts (Available only) for the four axes, computed from the live briefings rows (§5.2). */
function facetsOf(rows: CatalogBriefing[]): Facets {
  return {
    theme: computeFacets(rows, "theme"),
    domain: computeFacets(rows, "domain"),
    subdomain: computeFacets(rows, "subdomain"),
    company: computeFacets(rows, "company"),
  };
}

export async function getFacets(): Promise<Facets> {
  return facetsOf(await loadShelf());
}

/** Sidebar theaters (BL3-01): distinct theme names of briefing_type='theater' rows, NOT facet counts. */
export async function getTheaters(): Promise<string[]> {
  const rows = await loadShelf();
  return [...new Set(rows.filter((r) => r.briefingType === "theater").flatMap((r) => r.themes))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** One page of the shelf, built from public.briefings (no cache, no RPC). */
export async function getShelfPage(query: ShelfQuery): Promise<ShelfPage> {
  const rows = await loadShelf();
  const status = query.status && query.status !== "Owned" ? query.status : undefined;
  const { items, nextCursor } = search(rows, {
    q: query.q,
    theme: query.theme,
    domain: query.domain,
    subdomain: query.subdomain,
    company: query.company,
    status,
    type: query.type,
    sort: query.sort ?? "newest",
    cursor: query.cursor ?? null,
    limit: SHELF_PAGE_SIZE,
  });
  return { items, nextCursor, facets: facetsOf(rows), ...countsOf(rows) };
}

function countsOf(rows: CatalogBriefing[]) {
  return {
    availableCount: rows.filter((r) => r.status === "Available").length,
    comingSoonCount: rows.filter((r) => r.status === "Coming Soon").length,
  };
}

/** Live Available / Coming Soon counts for the cap guard and Blueprint (§11.3). */
export async function getAvailabilityCounts(): Promise<{ availableCount: number; comingSoonCount: number }> {
  return countsOf(await loadShelf());
}

/** A single briefing by slug, with the viewer's owned flag joined in (§11.3 owned overlay). */
export async function getBriefingBySlug(
  slug: string,
  subscriberId?: string
): Promise<CatalogBriefing | null> {
  const briefing = (await loadShelf()).find((r) => r.slug === slug) ?? null;
  if (!briefing) return null;
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
