import type { BriefingType } from "@/config/constants";
import type { CatalogBriefing } from "@/lib/types";
import { SHELF_GROUPS, stripComingSoon } from "@/lib/brand";
import { compareAz } from "@/lib/catalog-model";

/**
 * BL3-03 (FDY-335): the published-first shelf model. Pure, so grouping / ordering / counts are
 * unit tested without rendering.
 *
 * Per public type (SHELF_GROUPS order):
 *  - `available`: Available briefs, newest go_live_date (= published_at date) first, then id desc
 *    (the keyset order), rendered as full cards.
 *  - `planned`: every non-Available row, alphabetical by display title, then id; rendered only
 *    inside the section's collapsed <details>.
 *  - `inProduction`: N for the "N in production" line — the server's count over every row the
 *    query matches when it is known (so paging cannot undercount), never less than what is loaded.
 * A section with nothing Available and nothing in production is omitted; all omitted ⇒ the
 * existing empty state.
 */
export interface ShelfSection {
  type: BriefingType;
  label: string;
  note: string;
  available: CatalogBriefing[];
  planned: CatalogBriefing[];
  inProduction: number;
}

const byNewest = (a: CatalogBriefing, b: CatalogBriefing) => {
  const da = a.goLiveDate ?? "0001-01-01";
  const db = b.goLiveDate ?? "0001-01-01";
  if (da !== db) return da < db ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
};

// The same A–Z order the server pages planned rows in (compareAz), on the display title.
const byTitle = (a: CatalogBriefing, b: CatalogBriefing) =>
  compareAz({ title: stripComingSoon(a.title), id: a.id }, { title: stripComingSoon(b.title), id: b.id });

export function buildShelfSections(
  items: CatalogBriefing[],
  inProductionByType?: Partial<Record<BriefingType, number>>,
): ShelfSection[] {
  return SHELF_GROUPS.map((g) => {
    const ofType = items.filter((b) => b.briefingType === g.type);
    const available = ofType.filter((b) => b.status === "Available").sort(byNewest);
    const planned = ofType.filter((b) => b.status !== "Available").sort(byTitle);
    const inProduction = Math.max(planned.length, inProductionByType?.[g.type] ?? 0);
    return { ...g, available, planned, inProduction };
  }).filter((s) => s.available.length > 0 || s.inProduction > 0);
}

/**
 * The shelf's items once per-type planned runs (loaded A–Z on expand) are merged in: a type with a
 * run shows exactly that run as its planned list (a contiguous A–Z prefix), never the arbitrary
 * planned rows the main keyset page happened to carry. Available rows always come from the page.
 * De-duplicated by id.
 */
export function mergePlannedRuns(
  pageItems: CatalogBriefing[],
  runs: Partial<Record<BriefingType, { items: CatalogBriefing[] }>>,
): CatalogBriefing[] {
  const runTypes = new Set(Object.keys(runs));
  const runItems = Object.values(runs).flatMap((r) => r?.items ?? []);
  const seen = new Set<string>();
  return [...pageItems.filter((b) => b.status === "Available" || !runTypes.has(b.briefingType)), ...runItems].filter((b) =>
    seen.has(b.id) ? false : (seen.add(b.id), true),
  );
}

/**
 * Whether "More from the shelf" has Available rows left to load. Available rows carry a
 * go_live_date and sort before planned rows in the keyset, so once the last loaded row is not
 * Available every Available row is already on the shelf (the rest load from the section lines).
 */
export function hasMoreAvailable(page: { items: CatalogBriefing[]; nextCursor: string | null }): boolean {
  if (!page.nextCursor) return false;
  const last = page.items[page.items.length - 1];
  return !last || last.status === "Available";
}
