"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogBriefing, ShelfPage } from "@/lib/types";
import type { BriefingType } from "@/config/constants";
import { TYPE_CHIPS } from "@/lib/brand";
import { FacetRail, type NavKey } from "./FacetRail";
import { Shelf } from "./Shelf";
import { hasMoreAvailable, mergePlannedRuns } from "@/lib/shelf-sections";
import { useReserved } from "@/store/reserved-client";

/**
 * The Shelf (FBL 1.0): left sidebar (Theaters / Your Shelf), search + type
 * chips, grouped card grid. Sidebar theater × chip type × search combine and round-trip
 * through library_search (/api/library/catalog); "Reserved Briefings" filters the current
 * shelf to cart lines client-side. Price-free and D-code-free by brand rule; count-free except the
 * one approved exception, each section's "N in production" line (BL3-03, FDY-335).
 *
 * BL3-03: the keyset page lists Available rows first (they carry a go_live_date); planned rows sort
 * last and live inside each section's collapsed line. Opening a line loads that type's planned
 * rows A–Z from the catalog API (`type` + `status=Coming Soon` + `sort=az`, keyset-paged), so the
 * expanded list is a contiguous alphabetical run, never an arbitrary slice of the main page.
 * "More from the shelf" shows only while Available rows remain to load.
 */
type PlannedRun = { items: CatalogBriefing[]; cursor: string | null; done: boolean };
export function LibraryShell({ initial, theaters }: { initial: ShelfPage; theaters: string[] }) {
  const [navKey, setNavKey] = useState<NavKey>("all");
  const [chip, setChip] = useState<BriefingType | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<ShelfPage>(initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const { reservedIds } = useReserved();
  const firstRun = useRef(true);
  // Filters the CURRENT page was fetched with (decision 4 opens lines on these, not on live input).
  const [pageFilter, setPageFilter] = useState<{ q: string; navKey: NavKey }>({ q: "", navKey: "all" });
  // Per-type planned runs loaded on expand; reset whenever the filters change.
  const [planned, setPlanned] = useState<Partial<Record<BriefingType, PlannedRun>>>({});
  const [plannedLoading, setPlannedLoading] = useState<ReadonlySet<BriefingType>>(new Set());
  const generation = useRef(0);
  // Lines currently open (from <details> toggle events), so a filter change can reload their runs.
  const openTypes = useRef<Set<BriefingType>>(new Set());

  const queryParams = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (navKey.startsWith("t:")) params.set("theme", navKey.slice(2));
    if (chip !== "all") params.set("type", chip);
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  // Re-query the read-model when search/filters change (debounced).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    generation.current += 1;
    const gen = generation.current;
    // A line that stays open across the change gets an EMPTY run (never the new page's arbitrary
    // planned rows) until its fresh A–Z run arrives below.
    const stillOpen = [...openTypes.current];
    setPlanned(Object.fromEntries(stillOpen.map((t) => [t, { items: [], cursor: null, done: false }])));
    setPlannedLoading(new Set());
    const applied = { q, navKey };
    const t = setTimeout(async () => {
      const res = await fetch(`/api/library/catalog?${queryParams().toString()}`);
      if (res.ok && gen === generation.current) {
        const next: ShelfPage = await res.json();
        setPage(next);
        setPageFilter(applied);
        for (const type of stillOpen) if ((next.inProductionByType?.[type] ?? 0) > 0) void loadPlanned(type, true);
      }
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, navKey, chip]);

  const loadMore = async () => {
    if (!page.nextCursor || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/library/catalog?${queryParams(page.nextCursor).toString()}`);
      if (res.ok && gen === generation.current) {
        const next: ShelfPage = await res.json();
        setPage({ ...next, items: [...page.items, ...next.items] });
      }
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Load the next A–Z run of one type's planned rows (BL3-03). `restart` (after a filter change)
   * ignores this render's run/loading state, which the change has already reset.
   */
  const loadPlanned = async (type: BriefingType, restart = false) => {
    const run = restart ? undefined : planned[type];
    if (!restart && (plannedLoading.has(type) || run?.done)) return;
    const gen = generation.current;
    setPlannedLoading((s) => new Set(s).add(type));
    try {
      const params = queryParams(run?.cursor ?? null);
      params.set("type", type);
      params.set("status", "Coming Soon");
      params.set("sort", "az");
      const res = await fetch(`/api/library/catalog?${params.toString()}`);
      if (res.ok && gen === generation.current) {
        const next: ShelfPage = await res.json();
        setPlanned((p) => ({
          ...p,
          [type]: { items: [...(p[type]?.items ?? []), ...next.items], cursor: next.nextCursor, done: !next.nextCursor },
        }));
      }
    } catch {
      /* the line keeps what it has; "Show more" stays available */
    } finally {
      if (gen === generation.current) {
        setPlannedLoading((s) => {
          const n = new Set(s);
          n.delete(type);
          return n;
        });
      }
    }
  };

  // Client-side overlay filters on top of the server round-trip.
  const reserved = navKey === "reserved";
  // A type with a loaded A–Z run shows exactly that run as its planned list (contiguous A–Z).
  const items: CatalogBriefing[] = reserved
    ? page.items.filter((b) => reservedIds.has(b.id))
    : mergePlannedRuns(page.items, planned);
  // BL3-03 decision 4: an active search or Theater filter (the one this page was fetched with)
  // opens each section's "N in production" line; opening it loads the matching planned rows.
  // The per-type counts and the lines do not apply to the client-side Reserved overlay.
  const filterActive = !reserved && (pageFilter.q.trim() !== "" || pageFilter.navKey.startsWith("t:"));
  const inProduction = reserved ? undefined : page.inProductionByType;
  const moreAvailable = hasMoreAvailable(page);

  return (
    <div className="flex items-stretch min-h-[calc(100vh-69px)]">
      {/* Sidebar */}
      <aside className="w-[248px] shrink-0 bg-sidebar border-r border-hairline pt-7 pb-12 max-md:hidden">
        <FacetRail
          theaters={theaters}
          navKey={navKey}
          onNav={(key) => {
            setNavKey(key);
            setChip("all");
          }}
        />
      </aside>

      {/* Main column */}
      {/* BL3-04 (FDY-337): the content column grows to 1680 px, left-aligned next to the sidebar (no
          mx-auto) so nav and grid read as one frame; text blocks keep their own max widths. */}
      <main className="flex-1 min-w-0 px-6 md:px-11 pt-10 pb-20">
        <div className="max-w-[1680px]">
          <h1 className="font-serif font-bold text-[38px] text-ink m-0">The Briefing Library</h1>
          <div className="w-[72px] h-[3px] bg-forest mt-3.5" />
          <div className="w-[72px] h-0.5 bg-gold mt-[3px]" />
          <p className="text-base text-ink-soft leading-[1.55] max-w-[560px] mt-4">
            Follow the Thread, catch the Signals. Every Briefing on this shelf is current, sourced,
            and carries Faraday&rsquo;s Read.
          </p>

          {/* Search + type chips */}
          <div className="flex gap-3.5 items-center mt-[30px] flex-wrap">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the shelf…"
              aria-label="Search the shelf"
              className="flex-1 min-w-[220px] max-w-[380px] px-4 py-[11px] border border-warm-gray-2 bg-white text-[14.5px] text-ink outline-none rounded-none"
            />
            <div className="flex gap-2 flex-wrap">
              {TYPE_CHIPS.map(({ key, label }) => {
                const active = chip === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChip(key)}
                    aria-pressed={active}
                    className={`px-4 py-[9px] rounded-full text-[13px] font-medium border hover:border-forest ${
                      active
                        ? "bg-forest text-warm-white border-forest"
                        : "bg-transparent text-ink-soft border-warm-gray-2"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <Shelf
            items={items}
            reservedIds={reservedIds}
            inProductionByType={inProduction}
            openPlanned={filterActive}
            onExpandPlanned={reserved ? undefined : (type) => void loadPlanned(type)}
            onPlannedToggle={(type, open) => {
              if (open) openTypes.current.add(type);
              else openTypes.current.delete(type);
            }}
            plannedLoading={plannedLoading}
            plannedDone={new Set((Object.keys(planned) as BriefingType[]).filter((t) => planned[t]?.done))}
          />

          {moreAvailable && !reserved ? (
            <div className="mt-12 text-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="font-mono text-xs tracking-[1px] uppercase text-ink-soft border border-warm-gray-2 px-6 py-3 hover:border-forest disabled:opacity-50"
              >
                {loadingMore ? "Fetching…" : "More from the shelf"}
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
