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

/** Airtable editorial SOR (§3 context). */
export const AIRTABLE = {
  baseId: "appxfti7VuoHYUeu6",
  briefingsTableId: "tbl4kbby85nx6Z891",
  /** Field-ID map — the contract the sync reads (spec §11.1). */
  fields: {
    title: "fldim88BwzzAKTnyn",
    description: "fldzCX0KJ0sfrGmcd",
    status: "fldyhqKdqOibnhGgp",
    canonicalFlag: "fldwZcgAavE0InHni",
    gammaUrl: "fld1CaAL2JCVA0piy",
    gammaId: "fldg4RhWybQGXFwjA",
    attachments: "fldjZLGWyJDTHN64R", // editorial mirror ONLY — never the storefront source
    idfTheme: "fldC9T9Dm59g2qRHn",
    idfDomain: "fld3SAvJO9NCxm7gQ",
    idfSubdomain: "fldjtSjtK8l1N6Dqs",
    trackingCompanies: "fldcjHEEy3SUclWqY",
    downloadCounter: "fld2FLPk7QnqHaSAJ",
    goLiveDate: "flddONEuVoj4stpz6",
    // TODO(FBL 1.0 → editorial): Airtable has no fields for these yet. Until they exist the
    // sync derives briefing_type/byline from IDF placement and leaves hypothesis/contents
    // empty (src/lib/sync.ts). Replace the derivations with real field ids when added.
    briefingType: null as unknown as string, // TODO: add "Briefing Type" single-select in Airtable
    byline: null as unknown as string, // TODO: add "Byline" single-select (Gilbert | Mach)
    hypothesis: null as unknown as string, // TODO: add "Hypothesis" long text
    contents: null as unknown as string, // TODO: add "Contents" (one item per line)
  },
} as const;

/** Public-vocabulary briefing types (Theater/Sector/Thread/Key Player [+ Jurisdiction]). */
export const BRIEFING_TYPES = ["theater", "sector", "thread", "keyplayer", "jurisdiction"] as const;
export type BriefingType = (typeof BRIEFING_TYPES)[number];

/** Byline brand rule: Mach = forward thesis (Theater); Gilbert = empirical (everything else). */
export const BYLINES = ["Gilbert", "Mach"] as const;
export type Byline = (typeof BYLINES)[number];

/** Status values the shelf is eligible to mirror (§11.3). Nothing in Draft leaks. */
export const SHELF_ELIGIBLE_STATUS = ["Available", "Coming Soon"] as const;
export type ShelfStatus = (typeof SHELF_ELIGIBLE_STATUS)[number];
