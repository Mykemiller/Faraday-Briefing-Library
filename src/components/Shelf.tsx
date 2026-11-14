import type { BriefingType } from "@/config/constants";
import type { CatalogBriefing } from "@/lib/types";
import { inProductionLabel } from "@/lib/brand";
import { buildShelfSections } from "@/lib/shelf-sections";
import { Spine } from "./Spine";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-[26px]";

/**
 * The Shelf's result groups, in the fixed public-vocabulary order (Theater → Sector → Thread →
 * Company → Jurisdiction), each with its serif header + mono note over a hairline rule.
 *
 * BL3-03 (FDY-335), published-first: inside each section the Available briefs render first as
 * full cards (newest first). Planned/draft rows are never rendered individually by default: the
 * section shows one native <details> line, "N in production", closed by default, that expands to
 * the grid of planned cards (alphabetical, each with a "Coming soon" badge). A section with
 * nothing Available shows only that line, never a grid of grey cards. Native <details> keeps it
 * working without JS. An active search or Theater filter opens the line when it matches planned
 * rows (`openPlanned`). Opening a line whose planned rows are not all on the loaded page asks the
 * shell for that type's planned rows, A–Z (`onExpandPlanned`). Sections with nothing at all are
 * omitted; an all-empty result renders the dashed empty state.
 */
export function Shelf({
  items,
  reservedIds,
  inProductionByType,
  openPlanned = false,
  onExpandPlanned,
  onPlannedToggle,
  plannedLoading,
  plannedDone,
}: {
  items: CatalogBriefing[];
  reservedIds: ReadonlySet<string>;
  /** Server count of non-Available rows per type over every matching row (not just this page). */
  inProductionByType?: Partial<Record<BriefingType, number>>;
  /** True while a search or Theater filter is active: matching planned rows are shown open. */
  openPlanned?: boolean;
  /**
   * Called when a section's "N in production" line is opened (by the reader or by `openPlanned`)
   * and again from its "Show more" button, while fewer than N planned cards are loaded. The shell
   * fetches that type's planned rows A–Z. Without JS the line still opens on what is loaded.
   */
  onExpandPlanned?: (type: BriefingType) => void;
  /** Every open/close of a section's line (the shell reloads open lines after a filter change). */
  onPlannedToggle?: (type: BriefingType, open: boolean) => void;
  /** Types whose planned rows are being fetched. */
  plannedLoading?: ReadonlySet<BriefingType>;
  /** Types whose A–Z run is complete (no "Show more" even if rows changed between calls). */
  plannedDone?: ReadonlySet<BriefingType>;
}) {
  const sections = buildShelfSections(items, inProductionByType);

  if (sections.length === 0) {
    return (
      <div className="mt-[60px] p-12 border border-dashed border-warm-gray-2 text-center">
        <div className="font-serif italic text-[19px] text-ink-soft">Nothing on this shelf yet.</div>
        <p className="text-sm text-warm-gray mt-[10px]">Try a different Theater, or clear the search.</p>
      </div>
    );
  }

  return (
    <>
      {sections.map((s) => (
        <section key={s.type} className="mt-11" aria-label={s.label} data-shelf-section={s.type}>
          <div className="flex items-baseline gap-3.5">
            <h2 className="font-serif font-semibold text-[22px] text-ink m-0">{s.label}</h2>
            <div className="font-mono text-[11px] tracking-[0.5px] text-warm-gray">{s.note}</div>
          </div>
          <div className="h-px bg-hairline mt-2.5" />

          {s.available.length > 0 ? (
            <div className={`${GRID} mt-[22px]`} data-shelf-available="">
              {s.available.map((b) => (
                <Spine key={b.id} b={b} reserved={reservedIds.has(b.id)} />
              ))}
            </div>
          ) : null}

          {s.inProduction > 0 ? (
            <details
              className="group/planned mt-[22px]"
              data-shelf-planned=""
              open={openPlanned ? true : undefined}
              onToggle={(e) => {
                const open = e.currentTarget.open;
                onPlannedToggle?.(s.type, open);
                if (open && s.planned.length < s.inProduction && !plannedDone?.has(s.type)) onExpandPlanned?.(s.type);
              }}
            >
              <summary className="cursor-pointer select-none list-none font-mono text-[12px] tracking-[0.5px] text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block w-3 transition-transform group-open/planned:rotate-90">
                  ›
                </span>
                {inProductionLabel(s.inProduction)}
              </summary>
              {s.planned.length > 0 ? (
                <div className={`${GRID} mt-[18px]`}>
                  {s.planned.map((b) => (
                    <Spine key={b.id} b={b} reserved={reservedIds.has(b.id)} />
                  ))}
                </div>
              ) : null}
              {s.planned.length < s.inProduction && onExpandPlanned && !plannedDone?.has(s.type) ? (
                <button
                  type="button"
                  onClick={() => onExpandPlanned(s.type)}
                  disabled={plannedLoading?.has(s.type)}
                  className="mt-3.5 font-mono text-[11px] tracking-[0.6px] uppercase text-ink-soft border border-warm-gray-2 px-4 py-2 hover:border-forest disabled:opacity-50"
                >
                  {plannedLoading?.has(s.type) ? "Fetching…" : "Show more in production"}
                </button>
              ) : null}
            </details>
          ) : null}
        </section>
      ))}
    </>
  );
}
