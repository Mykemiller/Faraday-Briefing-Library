import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchShelfRecords, names, singleName, type AirtableRecord } from "@/lib/airtable";
import { AIRTABLE, BRIEFING_ACTIVE_CAP } from "@/config/constants";
import { briefingSlug } from "@/lib/slug";

const F = AIRTABLE.fields;

/** Map one Airtable record → a denormalized catalog cache row. */
export function toCacheRow(rec: AirtableRecord) {
  const f = rec.fields as Record<string, unknown>;
  const title = String(f[F.title] ?? "Untitled briefing");
  const status = singleName(f[F.status]) ?? "Coming Soon";
  return {
    id: rec.id,
    slug: briefingSlug(title, rec.id),
    briefing_title: title,
    briefing_description: String(f[F.description] ?? ""),
    status,
    canonical_flag: (f[F.canonicalFlag] as string) ?? null,
    gamma_url: (f[F.gammaUrl] as string) ?? null,
    gamma_id: (f[F.gammaId] as string) ?? null,
    themes: names(f[F.idfTheme]),
    domains: names(f[F.idfDomain]),
    subdomains: names(f[F.idfSubdomain]),
    companies: names(f[F.trackingCompanies]),
    download_count: Number(f[F.downloadCounter] ?? 0),
    go_live_date: (f[F.goLiveDate] as string) ?? null,
    synced_at: new Date().toISOString(),
    // preview_slides / preview_hash are owned by the preview worker — never overwritten here.
  };
}

export interface SyncResult {
  total: number;
  available: number;
  comingSoon: number;
  capExceeded: boolean; // internal flag only — never a subscriber-facing error (§11.3)
}

/**
 * Airtable → Supabase read-model sync. Upserts shelf-eligible records, prunes records that
 * fell out of eligibility, and surfaces an internal cap guard. Idempotent; safe to re-run.
 */
export async function runCatalogSync(): Promise<SyncResult> {
  const records = await fetchShelfRecords();
  const rows = records.map(toCacheRow);
  const sb = supabaseAdmin();

  // Upsert in chunks to stay well under payload limits.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb
      .from("library_catalog_cache")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw new Error(`catalog upsert failed: ${error.message}`);
  }

  // Prune rows that are no longer shelf-eligible (e.g. moved back to Draft).
  const keepIds = rows.map((r) => r.id);
  if (keepIds.length) {
    await sb.from("library_catalog_cache").delete().not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
  }

  const available = rows.filter((r) => r.status === "Available").length;
  const comingSoon = rows.filter((r) => r.status === "Coming Soon").length;
  return {
    total: rows.length,
    available,
    comingSoon,
    capExceeded: available > BRIEFING_ACTIVE_CAP,
  };
}
