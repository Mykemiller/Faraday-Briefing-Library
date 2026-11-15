import Link from "next/link";
import type { CatalogBriefing } from "@/lib/types";
import { monthYear, stripComingSoon } from "@/lib/brand";
import { Cover } from "./Cover";

/**
 * A shelf briefing card (FBL 1.0): typographic (or preview-PNG) cover, serif title,
 * 2-line abstract, mono meta ("June 2026 · Gilbert", + " · Reserved" when selected).
 * Coming Soon cards are dimmed 0.72 and inert, and carry a small mono "Coming soon" badge
 * (BL3-03): the state is a badge, never part of the title (the prefix is stripped at render time
 * as well as in the data layer). Available cards carry no badge. No prices, no counts, no D-codes.
 */
export function Spine({ b, reserved }: { b: CatalogBriefing; reserved?: boolean }) {
  const soon = b.status === "Coming Soon";
  const title = stripComingSoon(b.title) || "Untitled briefing"; // same fallback as the data layer
  const card = title === b.title ? b : { ...b, title };

  const body = (
    <>
      <Cover b={card} />
      <div className="font-serif font-semibold text-[16.5px] leading-[1.25] text-ink mt-3.5">{title}</div>
      <p className="text-[13px] leading-[1.5] text-ink-soft mt-1.5 line-clamp-2">{b.description}</p>
      {soon ? (
        <div className="mt-2">
          <span
            data-badge="coming-soon"
            className="inline-block font-mono text-[10px] tracking-[0.8px] uppercase text-ink-soft border border-warm-gray-2 px-1.5 py-[3px] leading-none"
          >
            Coming soon
          </span>
        </div>
      ) : (
        <div className="font-mono text-[10.5px] tracking-[0.4px] text-warm-gray mt-2 whitespace-pre">
          {`${monthYear(b.goLiveDate)}  ·  ${b.byline}${reserved ? "  ·  Reserved" : ""}`}
        </div>
      )}
    </>
  );

  if (soon) {
    return (
      <article className="opacity-[0.72]" aria-label={`${title}. Coming soon.`}>
        {body}
      </article>
    );
  }
  return (
    <Link href={`/library/b/${b.slug}`} className="group block" aria-label={`${title}. Open in the Reading Room.`}>
      {body}
    </Link>
  );
}
