import Link from "next/link";
import { notFound } from "next/navigation";
import { getBriefingBySlug } from "@/lib/catalog";
import { Masthead } from "@/components/Masthead";
import { LibraryFooter } from "@/components/LibraryFooter";
import { Cover } from "@/components/Cover";
import { PreviewReader } from "@/components/PreviewReader";
import { ReserveButton } from "@/components/ReserveButton";
import { FaradaysTake } from "@/components/FaradaysTake";
import { TYPE_EYEBROW, bylineLine, monthYear, shelfEdition } from "@/lib/brand";
import { flags } from "@/config/flags";
import { ANON_TEASER_SLIDES } from "@/config/constants";

export const dynamic = "force-dynamic";

/**
 * /library/b/[slug] — the Briefing Reading Room (FBL 1.0). Lamplit deep-forest room:
 * large cover, eyebrow/H1/byline/"Current as of", serif abstract, "In this Briefing",
 * ≤2-slide preview + locked-remainder card, Faraday's Take teaser, and Select (= reserve).
 * Pricing is out of scope (1.1): no token amounts, no checkout.
 */
export default async function BriefingReadingRoom({ params }: { params: { slug: string } }) {
  // TODO(commerce-on): resolve viewer via Clerk auth() to widen the anon teaser.
  const signedIn = false;
  const briefing = await getBriefingBySlug(params.slug);
  if (!briefing) notFound();

  const allSlides = briefing.previewSlides ?? [];
  // ≤2 rendered slides in this design (+ the locked card); anon deep links keep the teaser depth.
  const visibleSlides = (!signedIn && flags.anonTeaser ? allSlides.slice(0, ANON_TEASER_SLIDES) : allSlides).slice(0, 2);

  const updated = monthYear(briefing.goLiveDate);

  return (
    <>
      <Masthead context="Briefing Reading Room" edition={shelfEdition()} />
      <div className="bg-forest-deep min-h-[calc(100vh-69px)] relative overflow-hidden">
        {/* Lamplight — two radial gradients, pointer-events none */}
        <div className="absolute inset-0 pointer-events-none bg-lamplight" aria-hidden="true" />

        <div className="relative max-w-[1120px] mx-auto px-8 pt-[34px] pb-[90px]">
          <Link
            href="/library"
            className="font-mono text-xs tracking-[1px] uppercase text-sage hover:text-gold-light"
          >
            ← Back to the shelf
          </Link>

          <div className="grid md:grid-cols-[320px_1fr] gap-14 mt-9 items-start">
            <Cover b={briefing} variant="room" />

            <div>
              <div className="font-mono text-[11.5px] tracking-[1.6px] uppercase text-gold-light">
                {TYPE_EYEBROW[briefing.briefingType]}
              </div>
              <h1 className="font-serif font-bold text-[42px] leading-[1.1] text-warm-white mt-3 m-0 [text-wrap:pretty]">
                {briefing.title}
              </h1>
              <div className="flex gap-[18px] items-center mt-4 flex-wrap">
                <div className="font-mono text-xs text-sage">{bylineLine(briefing.byline)}</div>
                {updated ? (
                  <>
                    <div className="w-1 h-1 bg-gold rounded-full" aria-hidden="true" />
                    <div className="font-mono text-xs text-sage">Current as of {updated}</div>
                  </>
                ) : null}
              </div>

              <p className="font-serif text-[19px] leading-[1.55] text-dark-cream mt-[26px] max-w-[620px] [text-wrap:pretty]">
                {briefing.description}
              </p>

              {briefing.contents.length > 0 ? (
                <div className="mt-[34px]">
                  <div className="font-mono text-[11px] tracking-[1.6px] uppercase text-sage">
                    In this Briefing
                  </div>
                  <div className="mt-3 flex flex-col max-w-[520px]">
                    {briefing.contents.map((label, i) => (
                      <div
                        key={label}
                        className="flex gap-3.5 items-baseline py-[9px] border-b border-sage/[0.18]"
                      >
                        <div className="font-mono text-[11px] text-gold w-[22px] shrink-0">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <div className="text-[15px] text-dark-list">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <ReserveButton briefing={{ id: briefing.id, slug: briefing.slug, title: briefing.title }} />
            </div>
          </div>

          <PreviewReader briefing={briefing} slides={visibleSlides} />

          <FaradaysTake>
            Every Briefing closes with Faraday&rsquo;s opinion — short, specific, and his alone. It
            travels with the full Briefing.
          </FaradaysTake>
        </div>
      </div>
      <LibraryFooter />
    </>
  );
}
