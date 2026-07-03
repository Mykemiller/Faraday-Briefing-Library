import type { BriefingType, Byline, ShelfStatus } from "@/config/constants";

/** A denormalized catalog row as the storefront reads it from library_catalog_cache. */
export interface CatalogBriefing {
  id: string; // Airtable record id, e.g. recIXg6yYr6MNIJGm
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
  /** Public vocabulary type: theater | sector | thread | keyplayer | jurisdiction. */
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
