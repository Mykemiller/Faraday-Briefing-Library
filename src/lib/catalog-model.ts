import type { CatalogBriefing, FacetCount } from "@/lib/types";

/**
 * Reference implementations of the shelf query semantics, mirroring the library_search /
 * library_facets SQL RPCs. PRODUCTION uses Postgres (tsvector + GIN + keyset); these pure
 * functions exist to unit test FTS-ish matching, facet counting, and keyset pagination
 * correctness deterministically (Quality §5 risk area 3).
 */

export interface ModelQuery {
  q?: string;
  theme?: string;
  domain?: string;
  subdomain?: string;
  company?: string;
  status?: "Available" | "Coming Soon";
  /** Mirrors library_search p_type (FBL 1.0). */
  type?: string;
  sort?: "newest" | "az" | "downloads";
  cursor?: string | null;
  limit: number;
}

const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** plainto_tsquery-style AND match over title+description. */
function matchesText(b: CatalogBriefing, q?: string): boolean {
  if (!q) return true;
  const hay = new Set(tokenize(`${b.title} ${b.description}`));
  return tokenize(q).every((t) => hay.has(t));
}

/** Keyset key: coalesce(go_live_date, '0001-01-01') desc, id desc. */
function keyOf(b: CatalogBriefing): [string, string] {
  return [b.goLiveDate ?? "0001-01-01", b.id];
}
function lessThan(a: [string, string], b: [string, string]): boolean {
  if (a[0] !== b[0]) return a[0] < b[0];
  return a[1] < b[1];
}

export function computeFacets(rows: CatalogBriefing[], axis: "theme" | "domain" | "subdomain" | "company"): FacetCount[] {
  const counts = new Map<string, number>();
  for (const b of rows) {
    if (b.status !== "Available") continue; // facets count Available only (library_facets)
    const vals = axis === "theme" ? b.themes : axis === "domain" ? b.domains : axis === "subdomain" ? b.subdomains : b.companies;
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The rows a query matches, before sorting and paging (shared by search + the per-type counts). */
export function filterRows(rows: CatalogBriefing[], query: Omit<ModelQuery, "limit" | "cursor" | "sort">): CatalogBriefing[] {
  return rows.filter(
    (b) =>
      (!query.status || b.status === query.status) &&
      (!query.type || b.briefingType === query.type) &&
      matchesText(b, query.q) &&
      (!query.theme || b.themes.includes(query.theme)) &&
      (!query.domain || b.domains.includes(query.domain)) &&
      (!query.subdomain || b.subdomains.includes(query.subdomain)) &&
      (!query.company || b.companies.includes(query.company))
  );
}

/**
 * BL3-03 (FDY-335): non-Available rows per public type across EVERY row the query matches (not
 * just the loaded page), so a section's "N in production" line is the true count even when the
 * planned rows run past the first keyset page.
 */
export function inProductionByType(rows: CatalogBriefing[]): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const b of rows) if (b.status !== "Available") out[b.briefingType] = (out[b.briefingType] ?? 0) + 1;
  return out;
}

/**
 * A–Z order (BL3-03): title (case/accent-insensitive), then id — a total order, so it can be paged
 * by keyset. The "In production" lazy load pages planned rows of one type in this order.
 */
export function compareAz(a: Pick<CatalogBriefing, "title" | "id">, b: Pick<CatalogBriefing, "title" | "id">): number {
  return a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
const AZ_CURSOR = "az:";
function encodeAzCursor(b: CatalogBriefing): string {
  return `${AZ_CURSOR}${encodeURIComponent(b.title)}|${encodeURIComponent(b.id)}`;
}
function decodeAzCursor(c: string): { title: string; id: string } | null {
  if (!c.startsWith(AZ_CURSOR)) return null;
  const [t, i] = c.slice(AZ_CURSOR.length).split("|");
  if (t === undefined || i === undefined) return null;
  try {
    return { title: decodeURIComponent(t), id: decodeURIComponent(i) };
  } catch {
    return null;
  }
}

export function search(rows: CatalogBriefing[], query: ModelQuery): { items: CatalogBriefing[]; nextCursor: string | null } {
  let filtered = filterRows(rows, query);

  if (query.sort === "az") filtered.sort(compareAz);
  else if (query.sort === "downloads") filtered.sort((a, b) => b.downloadCount - a.downloadCount);
  else filtered.sort((a, b) => (lessThan(keyOf(a), keyOf(b)) ? 1 : -1)); // newest: desc by key

  if (query.sort === "az") {
    const c = query.cursor ? decodeAzCursor(query.cursor) : null;
    if (c) filtered = filtered.filter((b) => compareAz(b, c) > 0);
    const hasMore = filtered.length > query.limit;
    const items = hasMore ? filtered.slice(0, query.limit) : filtered;
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeAzCursor(last) : null };
  }

  if (query.sort !== "downloads" && query.cursor) {
    const [cd, ci] = query.cursor.split("|");
    const cKey: [string, string] = [cd === "null" ? "0001-01-01" : cd, ci];
    filtered = filtered.filter((b) => lessThan(keyOf(b), cKey));
  }

  const hasMore = filtered.length > query.limit;
  const items = hasMore ? filtered.slice(0, query.limit) : filtered;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? `${last.goLiveDate ?? "null"}|${last.id}` : null;
  return { items, nextCursor };
}
