import type { BriefingType, Byline, ShelfStatus } from "@/config/constants";

/** A denormalized catalog row as the storefront reads it from library_catalog_cache. */
export interface CatalogBriefing {
  id: string; // Airtable record id, e.g. recIXg6yYr6MNIJGm
  /** public.briefings.id (uuid) — the source row, used for the single-brief reader read (BL3-11). */
  sourceId?: string;
  slug: string;
  title: string;
  description: string;
  status: ShelfStatus;
  canonicalFlag: "Canonical" | "Placeholder" | string;
  gammaUrl: string | null;
  gammaId: string | null;
  themes: string[];
  domains: string[];
  subdomains: string[];
  companies: string[];
  downloadCount: number;
  goLiveDate: string | null; // ISO date
  /** Public vocabulary type: theater | sector | thread | jurisdiction. */
  briefingType: BriefingType;
  /** Gilbert — empirical; Mach — forward thesis. */
  byline: Byline;
  /** The hypothesis opener (preview slide 01 body). Empty until editorial fills it. */
  hypothesis: string;
  /** "In this Briefing" contents. Empty ⇒ the block is hidden. */
  contents: string[];
  /** Up to PREVIEW_SLIDE_MAX content-addressed PNG URLs in Supabase Storage. Null ⇒ fallback. */
  previewSlides: string[] | null;
  /** True when joined against the viewer's entitlements at render time (§11.3). */
  owned?: boolean;
}

/**
 * One `briefings.source_refs` jsonb entry as the lane generator writes it (docs/ops/lanes.md §7.1):
 * `url` + `title` required; `ref` ("S1"), `publisher`, `published_at` and the rest optional.
 */
export interface SourceRef {
  ref?: string | null;
  n?: number | null;
  url?: string | null;
  title?: string | null;
  publisher?: string | null;
  published_at?: string | null;
  date?: string | null;
  [key: string]: unknown;
}

/** A Sources-table row (BL3-11 decision 3): n, title, publisher, date, link (http/https only, else null). */
export interface SourceRow {
  n: number;
  title: string;
  publisher: string;
  date: string;
  href: string | null;
}

/** The single-brief reader fields (BL3-11), read from public.briefings only for an Available row. */
export interface ReaderFields {
  manuscriptMd: string | null;
  sourceRefs: SourceRef[];
  lastRefreshed: string | null;
  hypothesis: string;
}

export interface FacetCount {
  value: string;
  count: number; // live, from the cache — never a literal (§5.2, Precision value)
}

export interface Facets {
  theme: FacetCount[];
  domain: FacetCount[];
  subdomain: FacetCount[];
  company: FacetCount[];
}

export type SortKey = "newest" | "az" | "downloads";

export interface ShelfQuery {
  q?: string;
  theme?: string;
  domain?: string;
  subdomain?: string;
  company?: string;
  status?: ShelfStatus | "Owned";
  /** Public-vocabulary type filter (the shelf's type chips → library_search p_type). */
  type?: BriefingType;
  sort?: SortKey;
  /** Keyset cursor: encodes (go_live_date, id) of the last row seen. */
  cursor?: string | null;
}

export interface ShelfPage {
  items: CatalogBriefing[];
  nextCursor: string | null;
  facets: Facets;
  availableCount: number;
  comingSoonCount: number;
}

export interface CartLine {
  briefingId: string;
  briefingSlug: string;
  title: string;
  addedAt: string;
}
