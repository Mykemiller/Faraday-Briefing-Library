"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogBriefing, Facets, ShelfPage } from "@/lib/types";
import { Shelf } from "./Shelf";
import { FacetRail } from "./FacetRail";
import { WalletChip } from "./WalletChip";
import { CuratedRow } from "./CuratedRow";
import { flags } from "@/config/flags";

/**
 * Search-first shelf shell (§7.1). Search + facets are co-primary (L6). Wires the wallet chip,
 * the curated row, and the virtualized shelf. Facet/search state is URL-driven and shareable.
 */
export function LibraryShell({
  initial,
  curated,
  meter,
  balance,
}: {
  initial: ShelfPage;
  curated: CatalogBriefing[];
  meter: number | null;
  balance: number | null;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Record<string, string | undefined>>({});
  const [page, setPage] = useState<ShelfPage>(initial);
  const [cartCost, setCartCost] = useState(0);

  // Re-query the read-model when search/facets change (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      for (const [k, v] of Object.entries(active)) if (v) params.set(k, v);
      const res = await fetch(`/api/library/catalog?${params.toString()}`);
      if (res.ok) setPage(await res.json());
    }, 180);
    return () => clearTimeout(t);
  }, [q, active]);

  const facets: Facets = page.facets;

  const onAdd = (b: CatalogBriefing) => {
    if (!flags.commerceOn || meter == null) return;
    setCartCost((c) => c + meter);
    void fetch("/api/library/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingId: b.id, briefingSlug: b.slug }),
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif font-bold text-2xl text-forest">The Briefing Library</h1>
        <WalletChip balance={balance} cartCost={cartCost} />
      </header>
      <p className="font-serif italic text-forest/70 mt-1">Your unfair advantage.</p>

      <div className="mt-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search briefings…"
          aria-label="Search briefings"
          className="w-full md:w-96 bg-cream border border-forest/20 rounded-sm px-3 py-2 font-sans"
        />
      </div>

      <CuratedRow items={curated} />

      <div className="mt-4 flex items-center gap-4 font-mono text-xs text-forest/70">
        <span>{page.availableCount} available</span>
        <span>·</span>
        <a className="text-gold underline" href="/library/blueprint">
          {page.comingSoonCount} forthcoming → Intelligence Blueprint
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="md:sticky md:top-4 self-start">
          <FacetRail
            facets={facets}
            active={active}
            onSelect={(axis, value) => setActive((a) => ({ ...a, [axis]: value }))}
          />
        </aside>
        <main>
          <Shelf items={page.items} meter={meter} onAdd={onAdd} />
        </main>
      </div>
    </div>
  );
}
