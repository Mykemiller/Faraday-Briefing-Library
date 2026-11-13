import type { BriefingRow, Lookups } from "@/lib/briefings-source";
import { cacheIdFor, deriveBriefingType, deriveByline, shelfStatusFor } from "@/lib/sync";
import { briefingSlug } from "@/lib/slug";
import type { CatalogBriefing } from "@/lib/types";
import type { BriefingType } from "@/config/constants";

/**
 * BL3-01 (FDY-328): pure mapping `public.briefings` row → CatalogBriefing. No I/O, so it is unit
 * testable. The shelf is built from `briefings` (source of record), never from the
 * library_catalog_cache read-model and never through the service-role-only library_search RPC.
 */

/** Optional editorial extras that still live only on library_catalog_cache (no briefings column yet). */
export interface ShelfExtras {
  briefing_description?: string | null;
  canonical_flag?: string | null;
  gamma_url?: string | null;
  gamma_id?: string | null;
  download_count?: number | null;
  preview_slides?: string[] | null;
}

const COMING_SOON_PREFIX = /^\s*coming\s+soon\s*[—–-]\s*/i;

/** Defensive: the state is a status field, never part of the title (BL3-03 renders the badge). */
export function stripComingSoon(title: string): string {
  return title.replace(COMING_SOON_PREFIX, "").trim();
}

/**
 * Map one briefings row, or null when it must not be on the shelf: not published/planned
 * (retired, draft, qa), a published row dated in the future, or an unplaceable row (no explicit
 * type and nothing to derive one from — never defaulted to "sector"/"theater").
 */
export function briefingToCatalog(
  b: BriefingRow,
  lookups: Lookups,
  extras?: ShelfExtras | null,
  now = new Date(),
): CatalogBriefing | null {
  const status = shelfStatusFor(b, now);
  if (!status) return null;
  const id = cacheIdFor(b);
  if (id.startsWith("seed-")) return null; // fixtures are not briefings

  const themes = (b.theme_tags ?? []).map((c) => lookups.themes.get(c) ?? c);
  const domains = b.sector_id ? [lookups.domains.get(b.sector_id) ?? b.sector_id] : [];
  const subdomains = b.thread_id ? [lookups.subdomains.get(b.thread_id) ?? b.thread_id] : [];
  const companies = b.company_id ? [lookups.companies.get(b.company_id) ?? b.company_id] : [];

  const type = (b.briefing_type ??
    deriveBriefingType({
      jurisdictionId: b.jurisdiction_id,
      companyId: b.company_id,
      institutionId: b.institution_id,
      themes,
      domains,
      subdomains,
    })) as BriefingType | null;
  if (!type) return null;

  const title = stripComingSoon(b.title?.trim() || "") || "Untitled briefing";
  return {
    id,
    slug: briefingSlug(b.title?.trim() || "Untitled briefing", id), // slug keyed to the original title: links/carts stay stable
    title,
    description: extras?.briefing_description ?? "",
    status,
    canonicalFlag: extras?.canonical_flag ?? "Canonical",
    gammaUrl: extras?.gamma_url ?? null,
    gammaId: extras?.gamma_id ?? null,
    themes,
    domains,
    subdomains,
    companies,
    downloadCount: extras?.download_count ?? 0,
    goLiveDate: b.published_at ? b.published_at.slice(0, 10) : null,
    briefingType: type,
    byline: (b.byline as "Gilbert" | "Mach" | null) ?? deriveByline(type),
    hypothesis: b.hypothesis ?? "",
    contents: Array.isArray(b.contents) ? b.contents : [],
    previewSlides: extras?.preview_slides ?? null,
  };
}
