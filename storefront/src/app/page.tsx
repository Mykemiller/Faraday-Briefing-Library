import { listPublished } from "@/lib/briefings";
import { NO_FILTERS, activeFilterLabel, applyFilters, filterHref, jurisdictionOptions, parseFilters, tierCounts, typeCounts } from "@/lib/model";
import { DoubleRule } from "@/components/DoubleRule";
import { TypeNav } from "@/components/TypeNav";
import { TierChips } from "@/components/TierChips";
import { JurisdictionSelect } from "@/components/JurisdictionSelect";
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
  const isFiltered = Boolean(filters.tier || filters.type || filters.jurisdiction);
  const activeLabel = activeFilterLabel(filters);
  // Each control counts against the OTHER active filters, so a count is what you would get by picking it.
  const forTypes = applyFilters(all, { ...filters, type: null });
  const forTiers = applyFilters(all, { ...filters, tier: null });
  const forJurisdictions = applyFilters(all, { ...filters, jurisdiction: null });

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
        <>
          <TypeNav filters={filters} counts={typeCounts(forTypes)} total={forTypes.length} />
          <section aria-label="Filters" className="flex flex-col gap-6 py-8 sm:flex-row sm:items-end sm:justify-between">
            <TierChips filters={filters} counts={tierCounts(forTiers)} total={forTiers.length} />
            <JurisdictionSelect options={jurisdictionOptions(forJurisdictions)} value={filters.jurisdiction} tier={filters.tier} type={filters.type} />
          </section>
        </>
      ) : null}

      {all.length > 0 ? (
        <div className="flex items-baseline justify-between pb-4">
          <p aria-live="polite" className="font-mono text-xs uppercase tracking-eyebrow text-warm-gray">
            {shown.length} {shown.length === 1 ? "briefing" : "briefings"}
            {activeLabel ? <span className="text-ink"> · {activeLabel}</span> : null}
          </p>
          {isFiltered ? (
            <Link href={filterHref(NO_FILTERS)} className="text-sm text-forest underline decoration-gold underline-offset-4 hover:text-forest-mid">
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
