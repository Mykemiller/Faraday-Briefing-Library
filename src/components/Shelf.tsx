"use client";

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CatalogBriefing } from "@/lib/types";
import { Spine } from "./Spine";

/**
 * The Shelf (§7.1) — section-aware VIRTUALIZED grid (L5). Only on-screen rows mount, so the
 * iPad stays smooth and first paint is fast at the 100-cap. Domain sections with zero Available
 * briefings GHOST-COLLAPSE to one line (§7.8) rather than expanding empty rows.
 */

const COLS = 4;

type Row =
  | { kind: "header"; domain: string; available: number; comingSoon: number }
  | { kind: "collapsed"; domain: string; comingSoon: number }
  | { kind: "spines"; items: CatalogBriefing[] };

function buildRows(items: CatalogBriefing[]): Row[] {
  // Group by primary Domain (the shelf within a Theme section).
  const byDomain = new Map<string, CatalogBriefing[]>();
  for (const b of items) {
    const d = b.domains[0] ?? "Unshelved";
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(b);
  }
  const rows: Row[] = [];
  for (const [domain, list] of byDomain) {
    const available = list.filter((b) => b.status === "Available");
    const comingSoon = list.length - available.length;
    if (available.length === 0) {
      // Ghost-collapse: a single elegant line, no empty rows (§7.8).
      rows.push({ kind: "collapsed", domain, comingSoon });
      continue;
    }
    rows.push({ kind: "header", domain, available: available.length, comingSoon });
    for (let i = 0; i < available.length; i += COLS) {
      rows.push({ kind: "spines", items: available.slice(i, i + COLS) });
    }
  }
  return rows;
}

export function Shelf({
  items,
  meter,
  onAdd,
}: {
  items: CatalogBriefing[];
  meter: number | null;
  onAdd?: (b: CatalogBriefing) => void;
}) {
  const rows = useMemo(() => buildRows(items), [items]);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i].kind === "spines" ? 192 : rows[i].kind === "header" ? 56 : 44),
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="h-[70vh] overflow-auto" role="list" aria-label="Briefing shelf">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          return (
            <div
              key={v.key}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
            >
              {row.kind === "header" ? (
                <div className="sticky top-0 bg-warm-white py-2">
                  <h2 className="font-serif font-bold text-forest text-lg flex items-baseline gap-2">
                    {row.domain}
                    <span className="font-mono text-sm text-forest/60">({row.available})</span>
                  </h2>
                  <div className="double-rule mt-1" />
                </div>
              ) : row.kind === "collapsed" ? (
                <div className="py-2 text-forest/70 font-serif italic">
                  Forthcoming research: {row.comingSoon} {row.comingSoon === 1 ? "monograph" : "monographs"}
                  <span className="not-italic"> — </span>
                  <a className="text-gold underline" href="/library/blueprint">
                    see the Intelligence Blueprint
                  </a>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-1">
                  {row.items.map((b) => (
                    <Spine key={b.id} b={b} meter={meter} onAdd={onAdd} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
