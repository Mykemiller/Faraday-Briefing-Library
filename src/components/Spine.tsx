import Link from "next/link";
import type { CatalogBriefing } from "@/lib/types";
import { monthYear } from "@/lib/brand";
import { Cover } from "./Cover";

/**
 * A shelf briefing card (FBL 1.0): typographic (or preview-PNG) cover, serif title,
 * 2-line abstract, mono meta ("June 2026 · Gilbert", + " · Reserved" when selected).
 * Coming Soon cards are dimmed 0.72 and inert. No prices, no counts, no D-codes.
 */
export function Spine({ b, reserved }: { b: CatalogBriefing; reserved?: boolean }) {
  const soon = b.status === "Coming Soon";
  const meta = soon
    ? "In production"
    : `${monthYear(b.goLiveDate)}  ·  ${b.byline}${reserved ? "  ·  Reserved" : ""}`;

  const body = (
    <>
      <Cover b={b} />
      <div className="font-serif font-semibold text-[16.5px] leading-[1.25] text-ink mt-3.5">{b.title}</div>
      <p className="text-[13px] leading-[1.5] text-ink-soft mt-1.5 line-clamp-2">{b.description}</p>
      <div className="font-mono text-[10.5px] tracking-[0.4px] text-warm-gray mt-2 whitespace-pre">{meta}</div>
    </>
  );

  if (soon) {
    return (
      <article className="opacity-[0.72]" aria-label={`${b.title}. Coming soon.`}>
        {body}
      </article>
    );
  }
  return (
    <Link href={`/library/b/${b.slug}`} className="group block" aria-label={`${b.title}. Open in the Reading Room.`}>
      {body}
    </Link>
  );
}
