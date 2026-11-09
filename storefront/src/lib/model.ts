/**
 * Pure model for the storefront: the published-briefing shape, row normalisation, display
 * helpers and filters. No I/O here, so every rule is unit-tested.
 */

export const TIERS = ["deep", "standard", "profile"] as const;
export type Tier = (typeof TIERS)[number];

/** Brand Bible V2 §05 page targets. */
export const TIER_META: Record<Tier, { label: string; pages: string }> = {
  deep: { label: "Deep", pages: "10–15 pp" },
  standard: { label: "Standard", pages: "8–10 pp" },
  profile: { label: "Profile", pages: "2 pp" },
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : []);

/**
 * Public vocabulary (Brand Bible: Theater › Sector › Thread, plus Company and Jurisdiction).
 * `label` is the eyebrow on one briefing; `shelf` is the shelf-nav label. Internal D-codes and
 * type keys never render.
 */
export const BRIEFING_TYPES = ["theater", "sector", "thread", "company", "jurisdiction"] as const;
export type BriefingType = (typeof BRIEFING_TYPES)[number];

export const TYPE_META: Record<BriefingType, { label: string; shelf: string }> = {
  theater: { label: "Theater Briefing", shelf: "Theater Briefings" },
  sector: { label: "Sector Briefing", shelf: "Sector Briefings" },
  thread: { label: "Thread Briefing", shelf: "Thread Briefings" },
  company: { label: "Company Briefing", shelf: "Company Briefings" },
  jurisdiction: { label: "Jurisdiction Briefing", shelf: "Jurisdiction Briefings" },
};

/** Rows typed with a retired or unknown key (e.g. `keyplayer`, `institution`) carry no type. */
export function parseType(v: unknown): BriefingType | null {
  const key = str(v)?.toLowerCase();
  return key && (BRIEFING_TYPES as readonly string[]).includes(key) ? (key as BriefingType) : null;
}

/** Exactly the columns the storefront reads. Never `*`. */
export const BRIEFING_COLUMNS = [
  "id",
  "title",
  "tier",
  "briefing_type",
  "byline",
  "hypothesis",
  "contents",
  "theme_tags",
  "source_refs",
  "company_id",
  "institution_id",
  "jurisdiction_id",
  "page_target",
  "version",
  "published_at",
  "last_refreshed",
] as const;

export type BriefingRow = { [K in (typeof BRIEFING_COLUMNS)[number]]?: unknown };

export type SourceRef = { n: number; title: string; publisher: string | null; date: string | null; url: string | null };

export type Briefing = {
  id: string;
  title: string;
  tier: Tier | null;
  type: BriefingType | null;
  typeLabel: string | null;
  byline: string | null;
  hypothesis: string | null;
  contents: string[];
  themes: string[];
  sources: SourceRef[];
  entityId: string | null;
  pageTarget: number | null;
  version: number | null;
  publishedAt: string | null;
  lastRefreshed: string | null;
  /** `briefings.jurisdiction_id`: `US-XX` for a US state, ISO-3166 alpha-2 for a country. */
  jurisdiction: JurisdictionId | null;
};


/** Internal taxonomy codes (D3, D7.2, T1 …) are never printed. */
const INTERNAL_CODE = /^[A-Z]{1,3}\d+(\.\d+)*$/;

const SAFE_URL = /^https?:\/\//i;

export function parseSources(v: unknown): SourceRef[] {
  if (!Array.isArray(v)) return [];
  const out: SourceRef[] = [];
  v.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const title = str(r.title);
    const url = str(r.url);
    if (!title && !url) return;
    out.push({
      n: num(r.n) ?? i + 1,
      title: title ?? url!,
      publisher: str(r.publisher),
      date: str(r.published_at) ?? str(r.date),
      url: url && SAFE_URL.test(url) ? url : null,
    });
  });
  return out.sort((a, b) => a.n - b.n);
}

export function normalize(row: BriefingRow): Briefing | null {
  const id = str(row.id);
  const title = str(row.title);
  if (!id || !title) return null;
  const tierRaw = str(row.tier)?.toLowerCase();
  const tier = (TIERS as readonly string[]).includes(tierRaw ?? "") ? (tierRaw as Tier) : null;
  const type = parseType(row.briefing_type);
  return {
    id,
    title,
    tier,
    type,
    typeLabel: type ? TYPE_META[type].label : null,
    byline: str(row.byline),
    hypothesis: str(row.hypothesis),
    contents: strArr(row.contents),
    themes: strArr(row.theme_tags).filter((t) => !INTERNAL_CODE.test(t)),
    sources: parseSources(row.source_refs),
    entityId: str(row.company_id) ?? str(row.institution_id),
    pageTarget: num(row.page_target),
    version: num(row.version),
    publishedAt: str(row.published_at),
    lastRefreshed: str(row.last_refreshed),
    jurisdiction: parseJurisdiction(row.jurisdiction_id),
  };
}

/** Newest first: published_at desc (nulls last), then id desc for a stable order. */
export function sortNewestFirst(list: Briefing[]): Briefing[] {
  return [...list].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return a.publishedAt < b.publishedAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

// ── Jurisdiction ─────────────────────────────────────────────────────────────────────
// BL2-01 added `briefings.jurisdiction_id`: `US-XX` for a US state (incl. DC and PR), ISO-3166
// alpha-2 for a country. That column is the ONLY source of a briefing's jurisdiction; nothing is
// inferred from the title any more. A value outside the shape is treated as absent.

export const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
} as const;
export type UsState = keyof typeof US_STATES;

/** The column's CHECK shape (migration 20261109120000 §2). */
const JURISDICTION_ID = /^(US-[A-Z]{2}|[A-Z]{2})$/;
export type JurisdictionId = string;

/** `US-XX` or `XX`; case-insensitive on the way in, canonical upper-case on the way out. */
export function parseJurisdiction(v: unknown): JurisdictionId | null {
  const id = str(v)?.toUpperCase();
  if (!id || !JURISDICTION_ID.test(id)) return null;
  if (id.startsWith("US-") && !(id.slice(3) in US_STATES)) return null;
  return id;
}

export const isUsState = (id: JurisdictionId): boolean => id.startsWith("US-");

const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  } catch {
    return null;
  }
})();

/** Display name: the state name for `US-XX`, the English country name for an ISO code. */
export function jurisdictionName(id: JurisdictionId): string {
  if (isUsState(id)) return US_STATES[id.slice(3) as UsState] ?? id;
  return REGION_NAMES?.of(id) ?? id;
}

// ── Filters ─────────────────────────────────────────────────────────────────────────

export type Filters = { tier: Tier | null; type: BriefingType | null; jurisdiction: JurisdictionId | null };

export const NO_FILTERS: Filters = { tier: null, type: null, jurisdiction: null };

/**
 * `?tier=deep|standard|profile` · `?type=theater|sector|thread|company|jurisdiction` ·
 * `?jurisdiction=US-TX|DE|…`. `?state=TX` (the BL-12 parameter) is still accepted as an alias
 * for `?jurisdiction=US-TX` so old links keep working; `?jurisdiction` wins when both are sent.
 */
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();
  const tier = one(sp.tier)?.toLowerCase();
  const state = one(sp.state)?.toUpperCase();
  return {
    tier: (TIERS as readonly string[]).includes(tier ?? "") ? (tier as Tier) : null,
    type: parseType(one(sp.type)),
    jurisdiction: parseJurisdiction(one(sp.jurisdiction)) ?? (state ? parseJurisdiction(`US-${state}`) : null),
  };
}

export function applyFilters(list: Briefing[], f: Filters): Briefing[] {
  return list.filter(
    (b) => (!f.tier || b.tier === f.tier) && (!f.type || b.type === f.type) && (!f.jurisdiction || b.jurisdiction === f.jurisdiction),
  );
}

export type JurisdictionOption = { id: JurisdictionId; name: string; count: number; group: "us" | "country" };

/**
 * Jurisdictions present in the list — US states first, then countries, each alphabetical by
 * name. The menu never offers a dead option.
 */
export function jurisdictionOptions(list: Briefing[]): JurisdictionOption[] {
  const counts = new Map<JurisdictionId, number>();
  for (const b of list) if (b.jurisdiction) counts.set(b.jurisdiction, (counts.get(b.jurisdiction) ?? 0) + 1);
  return [...counts]
    .map(([id, count]) => ({ id, name: jurisdictionName(id), count, group: isUsState(id) ? ("us" as const) : ("country" as const) }))
    .sort((a, b) => (a.group !== b.group ? (a.group === "us" ? -1 : 1) : a.name.localeCompare(b.name)));
}

export function tierCounts(list: Briefing[]): Record<Tier, number> {
  const c: Record<Tier, number> = { deep: 0, standard: 0, profile: 0 };
  for (const b of list) if (b.tier) c[b.tier]++;
  return c;
}

export function typeCounts(list: Briefing[]): Record<BriefingType, number> {
  const c: Record<BriefingType, number> = { theater: 0, sector: 0, thread: 0, company: 0, jurisdiction: 0 };
  for (const b of list) if (b.type) c[b.type]++;
  return c;
}

/** Build a query string for a filter link, dropping empty values. */
export function filterHref(f: Filters): string {
  const p = new URLSearchParams();
  if (f.type) p.set("type", f.type);
  if (f.tier) p.set("tier", f.tier);
  if (f.jurisdiction) p.set("jurisdiction", f.jurisdiction);
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

/** The human label for the active filters, e.g. "Jurisdiction Briefings · Deep · Texas". */
export function activeFilterLabel(f: Filters): string {
  return [f.type ? TYPE_META[f.type].shelf : null, f.tier ? TIER_META[f.tier].label : null, f.jurisdiction ? jurisdictionName(f.jurisdiction) : null]
    .filter(Boolean)
    .join(" · ");
}

// ── Dates ───────────────────────────────────────────────────────────────────────────

export function formatDate(iso: string | null, style: "long" | "short" = "long"): string {
  if (!iso) return "";
  // A bare YYYY-MM-DD is a calendar date, not an instant: format it in UTC so it never shifts a
  // day. Full timestamps are shown in US Central (Faraday's working timezone).
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: dateOnly ? "UTC" : "America/Chicago",
    year: "numeric",
    month: style === "long" ? "long" : "short",
    day: "numeric",
  });
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
