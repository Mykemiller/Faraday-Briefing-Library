import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchShelfBriefings, type BriefingRow, type Lookups } from "@/lib/briefings-source";
import { BRIEFINGS_SOURCE, BRIEFING_ACTIVE_CAP, type BriefingType, type ShelfStatus } from "@/config/constants";
import { briefingSlug } from "@/lib/slug";

/** Inputs to the type derivation: the briefing's entity keys plus its resolved IDF placement. */
export interface TypeDerivationInput {
  /** briefings.jurisdiction_id — 'US-XX' or ISO-3166 alpha-2 (BL2-01). */
  jurisdictionId?: string | null;
  /** briefings.company_id — companies.company_uid (BL2-01: now decides the type). */
  companyId?: string | null;
  /** briefings.institution_id — institutions.institution_uid (counts as a company-type entity key). */
  institutionId?: string | null;
  themes: string[];
  domains: string[];
  subdomains: string[];
}

/**
 * briefing_type derivation (BL2-01, FDY-277 — founder decisions 1 + 2, 2026-11-09):
 *   jurisdiction_id ⇒ jurisdiction;  company_id (or institution_id) ⇒ company;
 *   then IDF placement: subdomain ⇒ thread; domain ⇒ sector; theme ⇒ theater;
 *   nothing at all ⇒ null (unplaced).
 * Entity keys outrank IDF placement because a key names WHAT the brief is about while placement
 * says WHERE it sits on the shelf; a company brief filed under a Thread is still a company brief.
 * (Measured 2026-11-09: 337 live rows carry company_id, 4 of them also carry a placement.)
 * Editorial can override by setting `briefings.briefing_type` directly (FDY-181) — that value
 * always wins over the derivation; the DB CHECK constraints keep the override honest
 * (jurisdiction ⇒ jurisdiction_id; company ⇒ company_id or institution_id).
 * byline brand rule: theater ⇒ Mach (forward thesis), else Gilbert (empirical).
 */
export function deriveBriefingType(row: TypeDerivationInput): BriefingType | null {
  if (row.jurisdictionId) return "jurisdiction";
  if (row.companyId || row.institutionId) return "company";
  if (row.subdomains.length) return "thread";
  if (row.domains.length) return "sector";
  if (row.themes.length) return "theater";
  return null;
}

export function deriveByline(briefingType: string): "Gilbert" | "Mach" {
  return briefingType === "theater" ? "Mach" : "Gilbert";
}

/** The cache id for a briefing: the Airtable record id while the migration trail exists (keeps
 *  slugs, cart lines and entitlements stable across the cutover), else the briefing's own uuid. */
export function cacheIdFor(b: Pick<BriefingRow, "id" | "airtable_record_id">): string {
  return b.airtable_record_id ?? b.id;
}

/** Shelf status for a `briefings.status`, or null when the row is not shelf-eligible. */
export function shelfStatusFor(b: Pick<BriefingRow, "status" | "published_at">, now = new Date()): ShelfStatus | null {
  const mapped = (BRIEFINGS_SOURCE.shelfStatuses as Record<string, ShelfStatus>)[b.status];
  if (!mapped) return null;
  // Available ⇒ published_at ≤ now (the old "Go live Date ≤ today" rule). A published row whose
  // publish timestamp is still in the future stays off the shelf until it arrives.
  if (mapped === "Available" && b.published_at && new Date(b.published_at) > now) return null;
  return mapped;
}

/** The columns the sync OWNS on library_catalog_cache. Everything else on the row —
 *  briefing_description, canonical_flag, gamma_url/gamma_id/gamma_updated_at (no briefings column
 *  yet: field-map gaps G1/G2/G6), download_count (bumped by library_checkout), preview_slides /
 *  preview_hash (owned by the preview worker) — is deliberately absent, so an upsert never
 *  overwrites it. */
export interface CacheRow {
  id: string;
  slug: string;
  briefing_title: string;
  status: ShelfStatus;
  themes: string[];
  domains: string[];
  subdomains: string[];
  companies: string[];
  briefing_type: string;
  byline: "Gilbert" | "Mach";
  hypothesis: string;
  contents: string[];
  go_live_date: string | null;
  synced_at: string;
}

/**
 * Map one `briefings` row → a denormalized catalog cache row, or null when the row is not
 * shelf-eligible. `existingType` is the type the cache already holds for this id: a row with no
 * entity key, no IDF placement and no explicit type keeps it rather than churning. (G3 is closed:
 * since BL2-01 a company placeholder derives `company` from its company_id.)
 */
export function toCacheRow(
  b: BriefingRow,
  lookups: Lookups,
  existingType?: string | null,
  now = new Date(),
): { row: CacheRow; placed: boolean } | null {
  const status = shelfStatusFor(b, now);
  if (!status) return null;
  const id = cacheIdFor(b);
  const title = b.title?.trim() || "Untitled briefing";
  const facets = {
    themes: (b.theme_tags ?? []).map((code) => lookups.themes.get(code) ?? code),
    domains: b.sector_id ? [lookups.domains.get(b.sector_id) ?? b.sector_id] : [],
    subdomains: b.thread_id ? [lookups.subdomains.get(b.thread_id) ?? b.thread_id] : [],
    companies: b.company_id ? [lookups.companies.get(b.company_id) ?? b.company_id] : [],
  };
  const derived = deriveBriefingType({
    jurisdictionId: b.jurisdiction_id,
    companyId: b.company_id,
    institutionId: b.institution_id,
    ...facets,
  });
  const briefingType = b.briefing_type ?? derived ?? (existingType || null) ?? "sector";
  const byline = (b.byline as "Gilbert" | "Mach" | null) ?? deriveByline(briefingType);
  return {
    placed: derived !== null || b.briefing_type !== null,
    row: {
      id,
      slug: briefingSlug(title, id),
      briefing_title: title,
      status,
      ...facets,
      briefing_type: briefingType,
      byline,
      hypothesis: b.hypothesis ?? "",
      contents: Array.isArray(b.contents) ? b.contents : [],
      go_live_date: b.published_at ? b.published_at.slice(0, 10) : null,
      synced_at: now.toISOString(),
    },
  };
}

export interface SyncResult {
  source: "briefings";
  total: number;
  available: number;
  comingSoon: number;
  unplaced: number; // shelf rows with neither an explicit type nor an IDF placement (type carried over)
  pruned: number; // cache rows that fell out of eligibility and were removed
  capExceeded: boolean; // internal flag only — never a subscriber-facing error (§11.3)
}

/**
 * briefings → library_catalog_cache read-model refresh. Upserts shelf-eligible briefings, prunes
 * cache rows that fell out of eligibility, and surfaces an internal cap guard. Idempotent; safe
 * to re-run. Never touches `briefings` itself.
 */
export async function runCatalogSync(): Promise<SyncResult> {
  const { briefings, lookups, existingTypes } = await fetchShelfBriefings();
  const now = new Date();
  const mapped = briefings
    .map((b) => toCacheRow(b, lookups, existingTypes.get(cacheIdFor(b)), now))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const rows = mapped.map((m) => m.row);
  const unplaced = mapped.filter((m) => !m.placed).length;
  const sb = supabaseAdmin();

  // Upsert in chunks to stay well under payload limits. Only the owned columns are sent, so an
  // existing row keeps its description / gamma / download_count / preview columns untouched.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb
      .from("library_catalog_cache")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw new Error(`catalog upsert failed: ${error.message}`);
  }

  // Prune rows that are no longer shelf-eligible (e.g. moved back to draft, or retired).
  // FBL 1.0 seed rows (id prefix 'seed-') are spared: they stand in for the designed shelf until
  // the real catalog supersedes them (FAR-213), then get removed deliberately.
  let pruned = 0;
  const keepIds = new Set(rows.map((r) => r.id));
  const stale = [...existingTypes.keys()].filter((id) => !keepIds.has(id) && !id.startsWith("seed-"));
  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200);
    const { error } = await sb.from("library_catalog_cache").delete().in("id", chunk);
    if (error) throw new Error(`catalog prune failed: ${error.message}`);
    pruned += chunk.length;
  }

  const available = rows.filter((r) => r.status === "Available").length;
  const comingSoon = rows.filter((r) => r.status === "Coming Soon").length;
  return {
    source: "briefings",
    total: rows.length,
    available,
    comingSoon,
    unplaced,
    pruned,
    capExceeded: available > BRIEFING_ACTIVE_CAP,
  };
}
