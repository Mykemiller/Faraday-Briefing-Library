"use client";

import type { CatalogBriefing } from "@/lib/types";
import { flags } from "@/config/flags";

/**
 * Briefing Spine (§7.2) — a cloth-bound book spine. Forest field, gold-foil title, sage Domain
 * band, mono price chip ("10 ◉"), inline add (+). Coming-Soon spines are muted with a sage
 * ribbon and no add control. Owned spines show a brass "in your library" mark.
 *
 * Status is textual, not colour-only (§13). Spine-lift is pointer-only via .spine-liftable (L3).
 */
export function Spine({
  b,
  meter,
  onAdd,
}: {
  b: CatalogBriefing;
  meter: number | null;
  onAdd?: (b: CatalogBriefing) => void;
}) {
  const isComingSoon = b.status === "Coming Soon";
  const domain = b.domains[0] ?? "";

  return (
    <article
      className="spine-liftable relative flex flex-col justify-between rounded-sm bg-forest text-warm-white p-3 h-44 overflow-hidden"
      aria-label={`${b.title}. ${isComingSoon ? "Coming soon." : b.owned ? "In your library." : "Available."}`}
    >
      {domain ? (
        <span className="absolute left-0 top-6 h-6 px-2 flex items-center bg-sage text-forest text-[10px] font-mono uppercase tracking-wide">
          {domain}
        </span>
      ) : null}

      <a href={`/library/b/${b.slug}`} className="block mt-8">
        <h3 className="font-serif font-bold text-gold leading-snug line-clamp-4">{b.title}</h3>
      </a>

      <div className="flex items-center justify-between">
        {isComingSoon ? (
          <span className="font-mono text-xs text-sage">Coming soon</span>
        ) : b.owned ? (
          <span className="font-mono text-xs text-gold">✦ In your library</span>
        ) : (
          <>
            <span className="font-mono text-sm text-warm-white">
              {meter != null ? `${meter} ◉` : "—"}
              <span className="sr-only"> {meter != null ? `${meter} tokens` : "price pending"}</span>
            </span>
            <button
              type="button"
              onClick={() => onAdd?.(b)}
              disabled={!flags.commerceOn || meter == null}
              className="touch-target rounded-sm bg-gold text-forest font-bold px-3 disabled:opacity-50"
              aria-label={`Add ${b.title} to your reading table`}
            >
              +
            </button>
          </>
        )}
      </div>
    </article>
  );
}
