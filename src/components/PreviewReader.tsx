import type { CatalogBriefing } from "@/lib/types";
import { ReadingChair } from "./ReadingChair";

/**
 * The Reading Room preview grid (FBL 1.0): ≤2 slide cards + the locked-remainder card.
 * Slides come from preview_slides (content-addressed Gamma PNGs); when they are null the
 * slide-01 card renders the `hypothesis` text (kicker "The Hypothesis"), falling back to
 * the description opener. The ReadingChair replaces the cards only when BOTH are missing.
 * Never Faraday's Take, never Sources (canon flag #7).
 */

function SlideFrame({ children }: { children: React.ReactNode }) {
  return <div className="aspect-[16/10] bg-warm-white px-6 py-[22px] flex flex-col shadow-slide">{children}</div>;
}

function TextSlide({ kicker, num, title, body }: { kicker: string; num: string; title: string; body: string }) {
  return (
    <SlideFrame>
      <div className="flex justify-between items-baseline">
        <div className="font-mono text-[10px] tracking-[1.4px] uppercase text-amber">{kicker}</div>
        <div className="font-mono text-[10px] text-warm-gray">{num}</div>
      </div>
      <div className="font-serif font-bold text-lg leading-[1.25] text-ink mt-3">{title}</div>
      <p className="text-[12.5px] leading-[1.55] text-ink-soft mt-[10px] line-clamp-4">{body}</p>
      <div className="mt-auto">
        <div className="h-0.5 bg-forest w-[30px]" />
        <div className="h-[1.5px] bg-gold w-[30px] mt-0.5" />
      </div>
    </SlideFrame>
  );
}

function LockedCard() {
  return (
    <div className="aspect-[16/10] bg-warm-white/[0.06] border border-dashed border-warm-gray-2/40 flex flex-col items-center justify-center gap-3 p-6">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="1.5" className="stroke-gold" strokeWidth="1.6" />
        <path d="M8 10 V7 a4 4 0 0 1 8 0 v3" className="stroke-gold" strokeWidth="1.6" fill="none" />
      </svg>
      <div className="font-serif text-base text-dark-list text-center leading-[1.4]">
        The rest of the Briefing is waiting.
      </div>
      <div className="font-mono text-[10.5px] tracking-[1px] uppercase text-sage text-center">
        Includes Faraday&rsquo;s Take · Sources &amp; methodology
      </div>
    </div>
  );
}

export function PreviewReader({ briefing, slides }: { briefing: CatalogBriefing; slides: string[] }) {
  const hypothesisBody = briefing.hypothesis || briefing.description;
  const hasSlides = slides.length > 0;
  const hasText = Boolean(hypothesisBody);

  return (
    <section className="mt-[72px]" aria-label="Preview">
      <div className="flex items-baseline gap-4 flex-wrap">
        <h2 className="font-serif font-semibold text-2xl text-warm-white m-0">Preview</h2>
        <div className="font-mono text-[11px] tracking-[0.6px] text-sage">
          The opening of the Briefing. The full deck unlocks on acquisition.
        </div>
      </div>
      <div className="w-14 h-[2.5px] bg-forest-light mt-3" />
      <div className="w-14 h-0.5 bg-gold mt-0.5" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[22px] mt-[26px]">
        {hasSlides ? (
          slides.map((src, i) => (
            <div key={src} className="aspect-[16/10] bg-warm-white shadow-slide overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${briefing.title}, preview slide ${i + 1}`}
                className="w-full h-full object-cover block"
              />
            </div>
          ))
        ) : hasText ? (
          <>
            <TextSlide
              kicker="The Hypothesis"
              num="01 / —"
              title="What Faraday thinks, stated first"
              body={hypothesisBody}
            />
            <TextSlide
              kicker={briefing.contents[1] ?? "The Evidence"}
              num="02 / —"
              title="The signal confluence behind the thesis"
              body="Sourced claims throughout — named companies, actual filings, dated proceedings. No &ldquo;experts predict.&rdquo; This body slide carries the evidence the hypothesis stands on."
            />
          </>
        ) : (
          <SlideFrame>
            <ReadingChair label="A preview is being prepared for this Briefing." />
          </SlideFrame>
        )}
        <LockedCard />
      </div>
    </section>
  );
}
