import type { CatalogBriefing } from "@/lib/types";
import { SHELF_GROUPS } from "@/lib/brand";
import { Spine } from "./Spine";

/**
 * The Shelf's result groups, in the fixed public-vocabulary order (Theater → Sector →
 * Thread → Key Player), each with its serif header + mono note over a hairline rule.
 * Groups with nothing on them are omitted entirely (the per-group ghost-collapse);
 * an all-empty result renders the dashed empty state. Count-free by brand rule.
 */
export function Shelf({
  items,
  reservedIds,
}: {
  items: CatalogBriefing[];
  reservedIds: ReadonlySet<string>;
}) {
  const groups = SHELF_GROUPS.map((g) => ({
    ...g,
    items: items.filter((b) => b.briefingType === g.type),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div className="mt-[60px] p-12 border border-dashed border-warm-gray-2 text-center">
        <div className="font-serif italic text-[19px] text-ink-soft">Nothing on this shelf yet.</div>
        <p className="text-sm text-warm-gray mt-[10px]">Try a different Theater, or clear the search.</p>
      </div>
    );
  }

  return (
    <>
      {groups.map((g) => (
        <section key={g.type} className="mt-11" aria-label={g.label}>
          <div className="flex items-baseline gap-3.5">
            <h2 className="font-serif font-semibold text-[22px] text-ink m-0">{g.label}</h2>
            <div className="font-mono text-[11px] tracking-[0.5px] text-warm-gray">{g.note}</div>
          </div>
          <div className="h-px bg-hairline mt-2.5" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(238px,1fr))] gap-[26px] mt-[22px]">
            {g.items.map((b) => (
              <Spine key={b.id} b={b} reserved={reservedIds.has(b.id)} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
