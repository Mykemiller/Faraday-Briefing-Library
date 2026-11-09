/**
 * Config constants (spec §C). Bound here, never scattered as literals.
 *
 * The token METER VALUE is deliberately NOT in this file: it is Myke-governed and
 * read at runtime from Supabase `product_meters['briefing_library']` (see lib/meter.ts).
 * FAR-46 owns the meter lock; FAR-56 marks product-meter changes always-human.
 */

/** v1.0 active-briefing cap. V2 raises to 1000 — stored as config so V2 is tuning, not refactor. */
export const BRIEFING_ACTIVE_CAP = 100;

/** The product_meters key the storefront's cost is bound to. The VALUE lives in Supabase. */
export const BRIEFING_METER_KEY = "briefing_library" as const;

/** Max preview slides per briefing: hypothesis opener + 1 body. Never Take/Sources (§7.4, Boundaries). */
export const PREVIEW_SLIDE_MAX = 3;

/**
 * Empty-shelf collapse threshold. A Domain section with availableCount === 0 ghost-collapses
 * to a single line (§7.8). V2 auto-inverts the live:coming-soon ratio; here it is a fixed config.
 */
export const SHELF_GHOST_COLLAPSE_RATIO = 0; // collapse when zero Available in the section (v1.0)

/** Keyset page size for the virtualized shelf (§11.2 keyset pagination). */
export const SHELF_PAGE_SIZE = 48;

/** Anonymous deep-link teaser depth (§4.1 / §18 flag #6). 1 slide, then sign-in wall. */
export const ANON_TEASER_SLIDES = 1;

/** Supabase project ref (system of record). */
export const SUPABASE_PROJECT_REF = "ycadmmngkdhvpcsrcuaq";

/**
 * Canonical home of the Briefing Library: Supabase `public.briefings` (DEC-IDF-65, BL-05 cutover).
 * The former Airtable table (base appxfti7VuoHYUeu6, table tbl4kbby85nx6Z891) is RETIRED —
 * description marked retired, every row retained, never read or written by this app. The one-time
 * migration that moved it is scripts/migrate-briefings.ts (docs/migration/reconciliation.md).
 */
export const BRIEFINGS_SOURCE = {
  table: "briefings",
  /** briefings.status → shelf status. Anything not listed (draft, qa, retired) never reaches the shelf. */
  shelfStatuses: { published: "Available", planned: "Coming Soon" },
} as const;

/**
 * Public-vocabulary briefing types. Theater/Sector/Thread (IDF placement), plus the two entity-keyed
 * types approved 2026-11-09 (BL2-01, FDY-277): Company (companies.company_uid / institutions) and
 * Jurisdiction (US states + countries, briefings.jurisdiction_id). Order = shelf group order.
 */
export const BRIEFING_TYPES = ["theater", "sector", "thread", "company", "jurisdiction"] as const;
export type BriefingType = (typeof BRIEFING_TYPES)[number];

/** Byline brand rule: Mach = forward thesis (Theater); Gilbert = empirical (everything else). */
export const BYLINES = ["Gilbert", "Mach"] as const;
export type Byline = (typeof BYLINES)[number];

/** Status values the shelf is eligible to mirror (§11.3). Nothing in Draft leaks. */
export const SHELF_ELIGIBLE_STATUS = ["Available", "Coming Soon"] as const;
export type ShelfStatus = (typeof SHELF_ELIGIBLE_STATUS)[number];
