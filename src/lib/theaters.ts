import { supabaseAdmin } from "@/lib/supabase/admin";
import { BRIEFINGS_SOURCE } from "@/config/constants";
import { deriveBriefingType } from "@/lib/sync";

/**
 * BL3-02 (FDY-334): the sidebar's "Theaters" list, built from data and STATUS-INDEPENDENT.
 *
 * Source (decision 1): the theme names in `faraday_themes`, ordered by the order of the theater
 * rows in `public.briefings` (briefing_type='theater', or derived theater: theme placement only).
 * Briefing status plays no part, so a theater whose briefs are all planned (or not yet written)
 * still gets its sidebar entry; the old list (facet counts of Available rows) showed only the 3
 * seed theaters. Names only: no counts (brand rule). Pure core + a thin service-role loader, so the
 * read is unit testable with a stub client. Nothing here writes.
 */

/** The faraday_themes columns the list needs. */
export interface ThemeRow {
  theme_code: string;
  name: string;
  active?: boolean | null;
}

/** The briefings columns that place and order a theater row. */
export interface TheaterBriefingRow {
  id: string;
  title: string | null;
  theme_tags: string[] | null;
  briefing_type: string | null;
  sector_id?: string | null;
  thread_id?: string | null;
  company_id?: string | null;
  institution_id?: string | null;
  jurisdiction_id?: string | null;
  published_at?: string | null;
}

export const THEME_SELECT = "theme_code,name,active";
export const THEATER_BRIEFING_SELECT =
  "id,title,theme_tags,briefing_type,sector_id,thread_id,company_id,institution_id,jurisdiction_id,published_at";

/** A briefings row is a theater row when typed so, or (untyped) when theme placement is all it has. */
export function isTheaterRow(b: TheaterBriefingRow): boolean {
  if (b.briefing_type) return b.briefing_type === "theater";
  return (
    deriveBriefingType({
      jurisdictionId: b.jurisdiction_id ?? null,
      companyId: b.company_id ?? null,
      institutionId: b.institution_id ?? null,
      themes: b.theme_tags ?? [],
      domains: b.sector_id ? [b.sector_id] : [],
      subdomains: b.thread_id ? [b.thread_id] : [],
    }) === "theater"
  );
}

/** Theater row order: published_at ascending (undated last), then title, then id. Deterministic. */
function compareTheaterRows(a: TheaterBriefingRow, b: TheaterBriefingRow): number {
  const pa = a.published_at ?? "";
  const pb = b.published_at ?? "";
  if (pa !== pb) {
    if (!pa) return 1;
    if (!pb) return -1;
    return pa < pb ? -1 : 1;
  }
  const t = (a.title ?? "").localeCompare(b.title ?? "");
  return t !== 0 ? t : a.id.localeCompare(b.id);
}

/**
 * Sidebar theater names. Every active faraday_themes row is listed exactly once (deduped by name),
 * whatever the status of its briefs: first the themes referenced by theater rows, in theater row
 * order; then any theme with no theater row yet, by name. A theater row's theme code with no
 * faraday_themes row is skipped (the registry is the source; the shelf would not resolve it).
 */
export function buildTheaterList(themes: ThemeRow[], briefings: TheaterBriefingRow[]): string[] {
  const live = themes.filter((t) => t.active !== false && t.name?.trim());
  const nameByCode = new Map(live.map((t) => [t.theme_code, t.name.trim()]));

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string | undefined) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  };

  for (const b of briefings.filter(isTheaterRow).sort(compareTheaterRows)) {
    for (const code of b.theme_tags ?? []) push(nameByCode.get(code));
  }
  for (const name of [...nameByCode.values()].sort((a, b) => a.localeCompare(b))) push(name);
  return out;
}

/** The minimal slice of a Supabase client the loader uses (lets tests pass a stub). */
type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
export interface TheaterSourceClient {
  from(table: string): {
    select(columns: string): {
      order(column: string): { range(from: number, to: number): QueryResult<unknown> };
      not(column: string, op: string, value: unknown): {
        order(column: string): { range(from: number, to: number): QueryResult<unknown> };
      };
    };
  };
}

const PAGE = 1000;

async function selectAll<T>(fetchPage: (from: number, to: number) => QueryResult<unknown>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Read faraday_themes + the theme-tagged briefings rows (ANY status: no status filter, by design)
 * with the service role and build the list. Throws on a read error; the caller decides the fallback.
 */
export async function loadTheaters(sb: TheaterSourceClient = supabaseAdmin() as unknown as TheaterSourceClient): Promise<string[]> {
  const [themes, briefings] = await Promise.all([
    selectAll<ThemeRow>((from, to) => sb.from("faraday_themes").select(THEME_SELECT).order("theme_code").range(from, to)),
    selectAll<TheaterBriefingRow>((from, to) =>
      sb
        .from(BRIEFINGS_SOURCE.table)
        .select(THEATER_BRIEFING_SELECT)
        .not("theme_tags", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  return buildTheaterList(themes, briefings);
}
