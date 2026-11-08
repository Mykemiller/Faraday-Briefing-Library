import Link from "next/link";
import { TIERS, TIER_META, filterHref, type Filters, type Tier } from "@/lib/model";

/** Tier filter: All / Deep / Standard / Profile, as links so every state is a shareable URL. */
export function TierChips({ filters, counts, total }: { filters: Filters; counts: Record<Tier, number>; total: number }) {
  const items: { key: Tier | null; label: string; count: number }[] = [
    { key: null, label: "All tiers", count: total },
    ...TIERS.map((t) => ({ key: t, label: TIER_META[t].label, count: counts[t] })),
  ];
  return (
    <nav aria-label="Filter by tier" className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.68rem] uppercase tracking-eyebrow text-warm-gray" aria-hidden="true">
        Tier
      </span>
      <ul className="flex flex-wrap gap-2">
        {items.map((it) => {
          const active = filters.tier === it.key;
          return (
            <li key={it.label}>
              <Link
                href={filterHref({ ...filters, tier: it.key })}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 font-sans text-sm transition-colors ${
                  active
                    ? "border-forest bg-forest text-paper"
                    : "border-warm-gray-2 text-ink hover:border-forest hover:text-forest"
                }`}
              >
                {it.label}
                <span className={`font-mono text-xs tabular-nums ${active ? "text-gold-light" : "text-warm-gray"}`}>
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
