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

/**
 * The single-brief reader columns (BL3-11, FDY-338): the shelf read above deliberately does not
 * pull `manuscript_md` / `source_refs` (436 rows × a full manuscript), so the reader fetches them
 * for ONE row by `briefings.id`, and only while that row is still `published`. byline and
 * hypothesis ride along so the reader shows what the row says now.
 */
export const READER_SELECT = "id,status,manuscript_md,source_refs,byline,last_refreshed,hypothesis";

export interface ReaderRow {
  id: string;
  status: string;
  manuscript_md: string | null;
  source_refs: unknown;
  byline: string | null;
  last_refreshed: string | null;
  hypothesis: string | null;
}

/**
 * Read the reader columns for one published briefing, or null when the row is gone, no longer
 * published, or the read fails. A failure never fails the page: the reader falls back to the
 * preview slides (BL3-11 decision 4).
 */
export async function loadReaderRow(sourceId: string): Promise<ReaderRow | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("briefings")
      .select(READER_SELECT)
      .eq("id", sourceId)
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as ReaderRow;
  } catch {
    return null;
  }
}
