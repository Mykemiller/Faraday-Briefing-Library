"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogBriefing, ShelfPage } from "@/lib/types";
import type { BriefingType } from "@/config/constants";
import { TYPE_CHIPS } from "@/lib/brand";
import { FacetRail, type NavKey } from "./FacetRail";
import { Shelf } from "./Shelf";
import { useReserved } from "@/store/reserved-client";

/**
 * The Shelf (FBL 1.0): left sidebar (Theaters / Key Players / Your Shelf), search + type
 * chips, grouped card grid. Sidebar theater × chip type × search combine and round-trip
 * through library_search (/api/library/catalog); "Reserved Briefings" filters the current
 * shelf to cart lines client-side. Count-free, price-free, D-code-free by brand rule.
 */
export function LibraryShell({ initial, theaters }: { initial: ShelfPage; theaters: string[] }) {
  const [navKey, setNavKey] = useState<NavKey>("all");
  const [chip, setChip] = useState<BriefingType | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState<ShelfPage>(initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const { reservedIds } = useReserved();
  const firstRun = useRef(true);

  const queryParams = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (navKey.startsWith("t:")) params.set("theme", navKey.slice(2));
    const type = chip !== "all" ? chip : navKey === "kp" ? "keyplayer" : null;
    if (type) params.set("type", type);
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  // Re-query the read-model when search/filters change (debounced).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/library/catalog?${queryParams().toString()}`);
      if (res.ok) setPage(await res.json());
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, navKey, chip]);

  const loadMore = async () => {
    if (!page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/library/catalog?${queryParams(page.nextCursor).toString()}`);
      if (res.ok) {
        const next: ShelfPage = await res.json();
        setPage({ ...next, items: [...page.items, ...next.items] });
      }
    } finally {
      setLoadingMore(false);
    }
  };

  // Client-side overlay filters on top of the server round-trip.
  let items: CatalogBriefing[] = page.items;
  if (navKey === "kp") items = items.filter((b) => b.briefingType === "keyplayer");
  if (navKey === "reserved") items = items.filter((b) => reservedIds.has(b.id));

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
      <main className="flex-1 min-w-0 px-6 md:px-11 pt-10 pb-20">
        <div className="max-w-[1180px]">
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

          <Shelf items={items} reservedIds={reservedIds} />

          {page.nextCursor && navKey !== "reserved" ? (
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
