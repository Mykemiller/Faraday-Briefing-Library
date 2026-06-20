import type { CatalogBriefing } from "@/lib/types";

/**
 * Lightweight curated strip (§7.7): Featured / New this month / Most-downloaded. Every tile is
 * bound to live data (Go live Date, Download counter). Deeper multi-row merchandising is V2.
 */
export function CuratedRow({ items }: { items: CatalogBriefing[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Curated" className="my-4">
      <div className="font-mono text-xs uppercase tracking-widest text-gold mb-2">
        Featured · New this month · Most-downloaded
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.slice(0, 8).map((b) => (
          <a
            key={b.id}
            href={`/library/b/${b.slug}`}
            className="shrink-0 w-48 bg-forest text-warm-white rounded-sm p-3 spine-liftable"
          >
            <h3 className="font-serif font-bold text-gold line-clamp-3">{b.title}</h3>
            <p className="font-mono text-[11px] text-sage mt-2">↓ {b.downloadCount}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
