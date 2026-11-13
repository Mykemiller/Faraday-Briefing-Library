import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchShelfBriefings } from "@/lib/briefings-source";
import { cacheIdFor } from "@/lib/sync";
import { briefingToCatalog, type ShelfExtras } from "@/lib/shelf-map";
import type { CatalogBriefing } from "@/lib/types";

/**
 * Server-only reader for the shelf (BL3-01, FDY-328). Reads `public.briefings` with the service
 * role (statuses published/planned only — retired/draft/qa are never selected). The only thing
 * still taken from library_catalog_cache is the editorial extras that have no briefings column
 * (description, gamma_*, download_count, preview slides), joined by id; stale cache ROWS can never
 * add or keep a card. No anon call, no RPC.
 */
export async function loadShelf(now = new Date()): Promise<CatalogBriefing[]> {
  const { briefings, lookups } = await fetchShelfBriefings();
  const sb = supabaseAdmin();

  const extras = new Map<string, ShelfExtras>();
  const { data, error } = await sb
    .from("library_catalog_cache")
    .select("id,briefing_description,canonical_flag,gamma_url,gamma_id,download_count,preview_slides")
    .limit(5000);
  if (!error) for (const r of (data ?? []) as (ShelfExtras & { id: string })[]) extras.set(r.id, r);
  // A failed extras read degrades to empty descriptions; it must never fail the shelf.

  return briefings
    .map((b) => briefingToCatalog(b, lookups, extras.get(cacheIdFor(b)), now))
    .filter((c): c is CatalogBriefing => c !== null);
}
