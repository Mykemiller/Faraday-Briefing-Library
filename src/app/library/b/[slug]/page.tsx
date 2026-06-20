import { notFound } from "next/navigation";
import { getBriefingBySlug } from "@/lib/catalog";
import { getBriefingMeter } from "@/lib/meter";
import { PreviewReader } from "@/components/PreviewReader";
import { ReadingChair } from "@/components/ReadingChair";
import { FaradaysTake } from "@/components/FaradaysTake";
import { flags } from "@/config/flags";
import { ANON_TEASER_SLIDES } from "@/config/constants";

export const dynamic = "force-dynamic";

/**
 * /library/b/[slug] — the open book (§7.3). ≤3 correct preview slides (never Take/Sources),
 * full description, byline, IDF placement, add-to-cart / owned / sign-in CTA.
 *
 * Preview-missing fallback (L4): when slides are null, widen the description to full width and
 * render the Reading-Chair graphic — never an empty frame.
 *
 * Anonymous deep links see the description + a single teaser slide, then a sign-in wall (§4.1).
 */
export default async function BriefingDetail({ params }: { params: { slug: string } }) {
  // TODO(commerce-on): resolve viewer via Clerk auth() to set `owned` + gate the teaser.
  const signedIn = false;
  const briefing = await getBriefingBySlug(params.slug);
  if (!briefing) notFound();

  const meter = await getBriefingMeter();
  const allSlides = briefing.previewSlides ?? [];
  const visibleSlides =
    !signedIn && flags.anonTeaser ? allSlides.slice(0, ANON_TEASER_SLIDES) : allSlides;
  const hasPreview = visibleSlides.length > 0;

  const idfPath = [briefing.themes[0], briefing.domains[0], briefing.subdomains[0]]
    .filter(Boolean)
    .join(" › ");
  // Byline: Gilbert for empirical briefings; Mach for forward-thesis (§7.3).
  const byline = briefing.canonicalFlag === "Placeholder" ? null : "Gilbert Faraday";

  return (
    <article className="max-w-5xl mx-auto px-4 py-8">
      <a href="/library" className="font-mono text-xs text-gold underline">← back to the shelf</a>

      <div className={`mt-4 grid gap-8 ${hasPreview ? "md:grid-cols-2" : "grid-cols-1"}`}>
        {hasPreview ? (
          <div>
            <PreviewReader title={briefing.title} slides={visibleSlides} />
            {!signedIn && flags.anonTeaser && allSlides.length > visibleSlides.length ? (
              <p className="mt-2 font-mono text-xs text-forest/70">
                Sign in to see the full {Math.min(allSlides.length, 3)}-slide preview.
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <h1 className="font-serif font-bold text-3xl text-forest">{briefing.title}</h1>
          {byline ? <p className="font-mono text-sm text-forest/60 mt-1">By {byline}</p> : null}
          {idfPath ? <p className="font-mono text-xs text-sage mt-1">{idfPath}</p> : null}

          {!hasPreview ? (
            <div className="my-5">
              <ReadingChair label="A preview is being prepared for this volume." />
            </div>
          ) : null}

          <p className="mt-4 text-forest leading-relaxed whitespace-pre-line">{briefing.description}</p>

          {briefing.status === "Available" ? (
            <FaradaysTake>This volume earns its place on the shelf — sit with it.</FaradaysTake>
          ) : null}

          <div className="mt-6">
            {briefing.status === "Coming Soon" ? (
              <button type="button" className="touch-target bg-sage text-forest font-bold rounded-sm px-4 py-2">
                Notify me when this ships
              </button>
            ) : briefing.owned ? (
              <a href="/library/owned" className="touch-target inline-flex items-center bg-gold text-forest font-bold rounded-sm px-4 py-2">
                ✦ Read — in your library
              </a>
            ) : (
              <button
                type="button"
                disabled={!flags.commerceOn || meter == null}
                className="touch-target bg-gold text-forest font-bold rounded-sm px-4 py-2 disabled:opacity-50"
              >
                {meter != null ? `Add to table — ${meter} ◉` : "Price pending"}
                <span className="sr-only">{meter != null ? ` (${meter} tokens)` : ""}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
