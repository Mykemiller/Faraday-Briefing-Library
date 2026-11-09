import Link from "next/link";
import { BRIEFING_TYPES, TYPE_META, filterHref, type BriefingType, type Filters } from "@/lib/model";

/**
 * Shelf navigation (Brand Bible public vocabulary): All briefings · Theater Briefings · Sector
 * Briefings · Thread Briefings · Company Briefings · Jurisdiction Briefings. Links, so every
 * shelf is a shareable URL; no internal type keys or D-codes are rendered.
 */
export function TypeNav({ filters, counts, total }: { filters: Filters; counts: Record<BriefingType, number>; total: number }) {
  const items: { key: BriefingType | null; label: string; count: number }[] = [
    { key: null, label: "All briefings", count: total },
    ...BRIEFING_TYPES.map((t) => ({ key: t, label: TYPE_META[t].shelf, count: counts[t] })),
  ];
  return (
    <nav aria-label="Shelves" className="border-b border-hairline">
      <ul className="-mb-px flex gap-x-6 overflow-x-auto">
        {items.map((it) => {
          const active = filters.type === it.key;
          return (
            <li key={it.label} className="shrink-0">
              <Link
                href={filterHref({ ...filters, type: it.key })}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={`inline-flex h-12 items-center gap-2 border-b-2 font-sans text-sm transition-colors ${
                  active ? "border-gold font-medium text-forest" : "border-transparent text-ink-soft hover:border-warm-gray-2 hover:text-forest"
                }`}
              >
                {it.label}
                <span className={`font-mono text-xs tabular-nums ${active ? "text-gold-ink" : "text-warm-gray"}`}>
                  <span className="sr-only">, </span>
                  {it.count}
                  <span className="sr-only"> {it.count === 1 ? "briefing" : "briefings"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
