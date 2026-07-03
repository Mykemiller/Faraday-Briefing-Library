import type { CatalogBriefing } from "@/lib/types";
import { TYPE_EYEBROW, coverBgClass, monthYear } from "@/lib/brand";

type CoverBriefing = Pick<
  CatalogBriefing,
  "title" | "status" | "briefingType" | "previewSlides" | "goLiveDate"
>;

/**
 * The briefing cover, aspect 3/4. When a briefing has preview_slides, the first
 * content-addressed PNG is the cover image (object-fit cover, same frame/shadow);
 * the TYPOGRAPHIC cover (CSS gradient by type) is the fallback — and always the
 * treatment for Coming Soon. Two sizes: shelf card and Reading Room.
 */
export function Cover({ b, variant = "card" }: { b: CoverBriefing; variant?: "card" | "room" }) {
  const room = variant === "room";
  const png = b.status !== "Coming Soon" ? b.previewSlides?.[0] : undefined;
  const frame = room
    ? "aspect-[3/4] shadow-cover-room border border-gold-light/25"
    : "aspect-[3/4] shadow-cover group-hover:shadow-cover-hover";

  if (png) {
    return (
      <div className={`${frame} overflow-hidden`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={png} alt={`${b.title} — briefing cover`} className="w-full h-full object-cover block" />
      </div>
    );
  }

  const soon = b.status === "Coming Soon";
  return (
    <div
      className={`${frame} ${coverBgClass(b)} flex flex-col justify-between ${
        room ? "px-6 py-7" : "px-[18px] py-5"
      }`}
    >
      <div>
        <div
          className={`font-mono uppercase text-gold ${
            room ? "text-[10.5px] tracking-[1.8px]" : "text-[9.5px] tracking-[1.6px]"
          }`}
        >
          {TYPE_EYEBROW[b.briefingType]}
        </div>
        <div className={room ? "w-11 h-[2.5px] bg-warm-white mt-3" : "w-[34px] h-0.5 bg-warm-white/90 mt-[10px]"} />
        <div className={room ? "w-11 h-0.5 bg-gold mt-0.5" : "w-[34px] h-[1.5px] bg-gold mt-0.5"} />
        <div
          className={`font-serif font-bold text-warm-white leading-[1.15] [text-wrap:pretty] ${
            room ? "text-3xl mt-[18px]" : `mt-3.5 ${b.title.length > 22 ? "text-[17px]" : "text-xl"}`
          }`}
        >
          {b.title}
        </div>
      </div>
      <div className="flex justify-between items-end">
        <div
          className={`font-mono uppercase text-sage ${
            room ? "text-[10px] tracking-[1.2px]" : "text-[9px] tracking-[1px]"
          }`}
        >
          {room ? `Faraday · ${monthYear(b.goLiveDate)}` : "Faraday"}
        </div>
        {!room && soon ? (
          <div className="font-mono text-[9px] tracking-[1.4px] uppercase text-ink bg-gold-light px-2 py-1">
            Coming Soon
          </div>
        ) : null}
      </div>
    </div>
  );
}
