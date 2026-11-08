import "server-only";
import { anonConfig } from "./env";
import { BRIEFING_COLUMNS, UUID, normalize, sortNewestFirst, type Briefing, type BriefingRow } from "./model";
import { fixtureRows, fixturesEnabled } from "./fixtures";

/**
 * The storefront's ONLY data access. Plain HTTP GET against PostgREST with the anon key.
 * There is deliberately no Supabase client here and no query builder, nothing that
 * could be extended into a write. `status=eq.published` is sent explicitly on top of the
 * BL-03 RLS policy, so the filter holds even if a policy is ever loosened.
 */

const REVALIDATE_SECONDS = 300;
const MAX_ROWS = 1000;

export class LibraryUnavailable extends Error {}

async function get(query: URLSearchParams): Promise<BriefingRow[]> {
  const cfg = anonConfig();
  if (!cfg) throw new LibraryUnavailable("Supabase anon credentials are not configured.");
  query.set("select", BRIEFING_COLUMNS.join(","));
  query.set("status", "eq.published");
  const headers: Record<string, string> = { apikey: cfg.anonKey, Accept: "application/json" };
  if (!cfg.anonKey.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${cfg.anonKey}`;
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/rest/v1/briefings?${query.toString()}`, {
      method: "GET",
      headers,
      next: { revalidate: REVALIDATE_SECONDS, tags: ["briefings"] },
    });
  } catch (e) {
    throw new LibraryUnavailable(`Library read failed: ${(e as Error).message}`);
  }
  if (!res.ok) throw new LibraryUnavailable(`Library read failed (HTTP ${res.status}).`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new LibraryUnavailable("Library read returned an unexpected shape.");
  return body as BriefingRow[];
}

const clean = (rows: BriefingRow[]) => rows.map(normalize).filter((b): b is Briefing => b !== null);

export async function listPublished(): Promise<Briefing[]> {
  if (fixturesEnabled()) return sortNewestFirst(fixtureRows());
  const q = new URLSearchParams({ order: "published_at.desc.nullslast,id.desc", limit: String(MAX_ROWS) });
  return sortNewestFirst(clean(await get(q)));
}

export async function getPublished(id: string): Promise<Briefing | null> {
  if (!UUID.test(id)) return null;
  if (fixturesEnabled()) return fixtureRows().find((b) => b.id === id) ?? null;
  const rows = clean(await get(new URLSearchParams({ id: `eq.${id}`, limit: "1" })));
  return rows[0] ?? null;
}
