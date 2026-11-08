import { listPublished } from "@/lib/briefings";
import { applyFilters, parseFilters, stateOptions, tierCounts, filterHref, US_STATES, TIER_META } from "@/lib/model";
import { DoubleRule } from "@/components/DoubleRule";
import { TierChips } from "@/components/TierChips";
import { StateSelect } from "@/components/StateSelect";
import { BriefingRow } from "@/components/BriefingRow";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";

// Filters come from the query string, so render per request; the data fetch itself is cached
// for 5 minutes (see lib/briefings.ts).
export const dynamic = "force-dynamic";

export default async function LibraryIndex({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const all = await listPublished();
  const filters = parseFilters(searchParams);
  const shown = applyFilters(all, filters);
  const isFiltered = Boolean(filters.tier || filters.state);
  const activeLabel = [filters.tier ? TIER_META[filters.tier].label : null, filters.state ? US_STATES[filters.state] : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-page px-4 sm:px-8">
      <section className="pb-10 pt-14 sm:pt-20">
        <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-gold-ink">The Library</p>
        <h1 className="mt-4 max-w-[18ch] font-serif text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          Published briefings
        </h1>
        <p className="mt-5 max-w-measure text-lg leading-relaxed text-ink-soft">
          Faraday&rsquo;s briefings on the infrastructure buildout, newest first. Each one opens with its thesis and ends
          with its sources.
        </p>
        <DoubleRule className="mt-10" />
      </section>

      {all.length > 0 ? (
        <section aria-label="Filters" className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <TierChips filters={filters} counts={tierCounts(applyFilters(all, { ...filters, tier: null }))} total={applyFilters(all, { ...filters, tier: null }).length} />
          <StateSelect options={stateOptions(applyFilters(all, { ...filters, state: null }))} value={filters.state} tier={filters.tier} />
        </section>
      ) : null}

      {all.length > 0 ? (
        <div className="flex items-baseline justify-between pb-4">
          <p aria-live="polite" className="font-mono text-xs uppercase tracking-eyebrow text-warm-gray">
            {shown.length} {shown.length === 1 ? "briefing" : "briefings"}
            {activeLabel ? <span className="text-ink"> · {activeLabel}</span> : null}
          </p>
          {isFiltered ? (
            <Link href={filterHref({ tier: null, state: null })} className="text-sm text-forest underline decoration-gold underline-offset-4 hover:text-forest-mid">
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : null}

      {shown.length > 0 ? (
        <ol aria-label="Published briefings, newest first">
          {shown.map((b) => (
            <BriefingRow key={b.id} b={b} />
          ))}
        </ol>
      ) : (
        <EmptyState filtered={all.length > 0 && isFiltered} />
      )}
    </div>
  );
}
