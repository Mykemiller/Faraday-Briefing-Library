import type { BriefingType } from "@/config/constants";
import type { CatalogBriefing } from "@/lib/types";
import { SHELF_GROUPS, stripComingSoon } from "@/lib/brand";

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

const byTitle = (a: CatalogBriefing, b: CatalogBriefing) =>
  stripComingSoon(a.title).localeCompare(stripComingSoon(b.title), "en", { sensitivity: "base" }) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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
