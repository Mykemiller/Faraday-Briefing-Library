import Link from "next/link";
import { notFound } from "next/navigation";
import { getReaderBriefing } from "@/lib/catalog";
import { viewerSubscriberId } from "@/lib/viewer";
import { readerView, refreshedOn } from "@/lib/reader";
import { Masthead } from "@/components/Masthead";
import { LibraryFooter } from "@/components/LibraryFooter";
import { Cover } from "@/components/Cover";
import { PreviewReader, LockedCard } from "@/components/PreviewReader";
import { ReserveButton } from "@/components/ReserveButton";
import { FaradaysTake } from "@/components/FaradaysTake";
import { Manuscript } from "@/components/Manuscript";
import { SourcesTable } from "@/components/SourcesTable";
import { TYPE_EYEBROW, bylineLine, monthYear, shelfEdition } from "@/lib/brand";
import { flags } from "@/config/flags";
import { ANON_TEASER_SLIDES } from "@/config/constants";

export const dynamic = "force-dynamic";

/** "In this Briefing" labels: short single-line entries only (lane drafts can hold whole sections). */
function contentLabels(contents: string[]): string[] {
  return contents.filter((c) => typeof c === "string" && c.trim() && !c.includes("\n") && c.length <= 120);
}

function Thesis({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="bg-warm-white/[0.05] border-l-2 border-gold px-6 py-5 max-w-[720px]">
      <div className="font-mono text-[11px] tracking-[1.6px] uppercase text-gold-light">The Hypothesis</div>
      <p className="font-serif text-[21px] leading-[1.5] text-warm-white mt-3 mb-0 [text-wrap:pretty]">{text}</p>
    </div>
  );
}

function TakeTeaser() {
  return (
    <FaradaysTake>
      Every Briefing closes with Faraday&rsquo;s opinion — short, specific, and his alone. It travels with
      the full Briefing.
    </FaradaysTake>
  );
}

/**
 * /library/b/[slug] — the Briefing Reading Room (FBL 1.0 design; BL3-11 reader, FDY-338).
 *
 * Available + manuscript_md → the manuscript as safe Markdown, thesis first. Owners (a
 * library_entitlements row) read every section plus the Sources table from source_refs; everyone
 * else reads the thesis and the first section, then Reserve. Available without a manuscript keeps
 * the preview slides (no Sources table). Coming Soon is a "not yet published" page: no manuscript,
 * no preview, no Reserve. Pricing stays out of scope: no token amounts here.
 */
export default async function BriefingReadingRoom({ params }: { params: { slug: string } }) {
  const viewer = await viewerSubscriberId();
  const found = await getReaderBriefing(params.slug, viewer);
  if (!found) notFound();
  const { briefing, reader } = found;

  const owned = !!briefing.owned;
  const view = readerView({ status: briefing.status, owned, reader, fallbackHypothesis: briefing.hypothesis });

  const updated = monthYear(briefing.goLiveDate);
  const refreshed = refreshedOn(reader?.lastRefreshed);
  const labels = view.kind === "teaser" || view.kind === "full" ? view.outline : contentLabels(briefing.contents);
  const showReserve = !owned && (view.kind === "teaser" || view.kind === "fallback");

  // Fallback preview: ≤2 rendered slides (+ the locked card); anon deep links keep the teaser depth.
  const allSlides = briefing.previewSlides ?? [];
  const visibleSlides = (!viewer && flags.anonTeaser ? allSlides.slice(0, ANON_TEASER_SLIDES) : allSlides).slice(0, 2);

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
                {refreshed ? (
                  <>
                    <div className="w-1 h-1 bg-gold rounded-full" aria-hidden="true" />
                    <div className="font-mono text-xs text-sage">Last refreshed {refreshed}</div>
                  </>
                ) : null}
              </div>

              {briefing.description ? (
                <p className="font-serif text-[19px] leading-[1.55] text-dark-cream mt-[26px] max-w-[620px] [text-wrap:pretty]">
                  {briefing.description}
                </p>
              ) : null}

              {labels.length > 0 ? (
                <div className="mt-[34px]">
                  <div className="font-mono text-[11px] tracking-[1.6px] uppercase text-sage">
                    In this Briefing
                  </div>
                  <div className="mt-3 flex flex-col max-w-[520px]">
                    {labels.map((label, i) => (
                      <div
                        key={`${i}-${label}`}
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

              {showReserve ? (
                <ReserveButton briefing={{ id: briefing.id, slug: briefing.slug, title: briefing.title }} />
              ) : null}
              {owned && view.kind !== "unpublished" ? (
                <div className="font-mono text-xs text-sage mt-[38px]">In your library. The full Briefing is below.</div>
              ) : null}
            </div>
          </div>

          {view.kind === "unpublished" ? (
            <section className="mt-[72px] max-w-[720px]" aria-label="Not yet published">
              <div className="border border-dashed border-warm-gray-2/40 bg-warm-white/[0.04] px-8 py-10">
                <div className="font-mono text-[11px] tracking-[1.6px] uppercase text-gold-light">Coming Soon</div>
                <h2 className="font-serif font-semibold text-2xl text-warm-white mt-3 mb-0">
                  This Briefing is not yet published.
                </h2>
                <p className="font-serif text-[17px] leading-[1.6] text-dark-cream mt-3 mb-0">
                  It is on the shelf and in preparation. It opens here, in full, once it is published.
                </p>
              </div>
            </section>
          ) : null}

          {view.kind === "fallback" ? (
            <>
              <PreviewReader briefing={briefing} slides={visibleSlides} />
              {owned ? null : <TakeTeaser />}
            </>
          ) : null}

          {view.kind === "teaser" ? (
            <section className="mt-[72px]" aria-label="Preview">
              <Thesis text={view.hypothesis} />
              <div className="mt-6">
                <Manuscript markdown={view.sections.map((s) => s.md).join("\n\n")} />
              </div>
              <div className="mt-12 max-w-[520px]">
                <LockedCard />
              </div>
              <TakeTeaser />
            </section>
          ) : null}

          {view.kind === "full" ? (
            <article className="mt-[72px]" aria-label="Briefing">
              <Thesis text={view.hypothesis} />
              <div className="mt-6">
                <Manuscript markdown={view.sections.map((s) => s.md).join("\n\n")} />
              </div>
              <SourcesTable
                rows={view.sources}
                methodology={view.methodology ? <Manuscript markdown={view.methodology} /> : undefined}
              />
            </article>
          ) : null}
        </div>
      </div>
      <LibraryFooter />
    </>
  );
}
