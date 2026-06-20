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
  company?: string;
  status?: "Available" | "Coming Soon";
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

export function computeFacets(rows: CatalogBriefing[], axis: "theme" | "domain" | "company"): FacetCount[] {
  const counts = new Map<string, number>();
  for (const b of rows) {
    if (b.status !== "Available") continue; // facets count Available only (library_facets)
    const vals = axis === "theme" ? b.themes : axis === "domain" ? b.domains : b.companies;
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function search(rows: CatalogBriefing[], query: ModelQuery): { items: CatalogBriefing[]; nextCursor: string | null } {
  let filtered = rows.filter(
    (b) =>
      (!query.status || b.status === query.status) &&
      matchesText(b, query.q) &&
      (!query.theme || b.themes.includes(query.theme)) &&
      (!query.domain || b.domains.includes(query.domain)) &&
      (!query.company || b.companies.includes(query.company))
  );

  if (query.sort === "az") filtered.sort((a, b) => a.title.localeCompare(b.title));
  else if (query.sort === "downloads") filtered.sort((a, b) => b.downloadCount - a.downloadCount);
  else filtered.sort((a, b) => (lessThan(keyOf(a), keyOf(b)) ? 1 : -1)); // newest: desc by key

  if (query.sort !== "az" && query.sort !== "downloads" && query.cursor) {
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
