import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublished } from "@/lib/briefings";
import { TIER_META, formatDate } from "@/lib/model";
import { entityFor } from "@/lib/entities";
import { DoubleRule } from "@/components/DoubleRule";
import { EntityMark } from "@/components/EntityMark";
import { eyebrow } from "@/components/BriefingRow";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await getPublished(params.id);
  if (!b) return { title: "Not found" };
  return { title: b.title, description: b.hypothesis ?? undefined };
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 py-10 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
      <h2 id={id} className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-gold-ink md:pt-1.5">
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function BriefingPage({ params }: Props) {
  const b = await getPublished(params.id);
  if (!b) notFound();
  const entity = entityFor(b.entityId);
  const label = eyebrow(b);

  const facts: { term: string; value: React.ReactNode }[] = [];
  if (b.byline) facts.push({ term: "Byline", value: b.byline });
  if (b.publishedAt) facts.push({ term: "Published", value: <time dateTime={b.publishedAt}>{formatDate(b.publishedAt)}</time> });
  if (b.lastRefreshed && b.lastRefreshed !== b.publishedAt)
    facts.push({ term: "Refreshed", value: <time dateTime={b.lastRefreshed}>{formatDate(b.lastRefreshed)}</time> });
  if (b.pageTarget) facts.push({ term: "Length", value: `${b.pageTarget} pages` });
  else if (b.tier) facts.push({ term: "Length", value: TIER_META[b.tier].pages });
  if (b.version && b.version > 1) facts.push({ term: "Edition", value: `Version ${b.version}` });
  facts.push({ term: "Sources", value: String(b.sources.length) });

  return (
    <article className="mx-auto max-w-page px-4 sm:px-8">
      <nav aria-label="Breadcrumb" className="pt-8">
        <Link href="/" className="inline-flex h-11 items-center gap-2 text-sm text-forest hover:text-forest-mid">
          <span aria-hidden="true">←</span> All briefings
        </Link>
      </nav>

      <header className="pb-10 pt-6 sm:pt-10">
        {label ? <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-gold-ink">{label}</p> : null}
        <h1 className="mt-4 max-w-[24ch] font-serif text-[2.4rem] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[3.4rem]">
          {b.title}
        </h1>
        {entity ? (
          <div className="mt-6">
            <EntityMark entity={entity} size="lg" />
          </div>
        ) : null}
        <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
          {facts.map((f) => (
            <div key={f.term}>
              <dt className="font-mono text-[0.68rem] uppercase tracking-eyebrow text-warm-gray">{f.term}</dt>
              <dd className="mt-1 text-[0.95rem] text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
        {b.themes.length ? (
          <ul aria-label="Theaters" className="mt-6 flex flex-wrap gap-2">
            {b.themes.map((t) => (
              <li key={t} className="rounded-full border border-hairline px-3 py-1 text-xs text-ink-soft">
                {t}
              </li>
            ))}
          </ul>
        ) : null}
        <DoubleRule className="mt-10" />
      </header>

      {b.hypothesis ? (
        <Section id="thesis" title="The thesis">
          <p className="max-w-measure font-serif text-[1.45rem] leading-[1.5] text-ink sm:text-[1.6rem]">{b.hypothesis}</p>
        </Section>
      ) : null}

      {b.contents.length ? (
        <Section id="contents" title="Contents">
          <ol className="max-w-measure divide-y divide-hairline border-y border-hairline">
            {b.contents.map((c, i) => (
              <li key={`${i}-${c}`} className="flex gap-5 py-3.5">
                <span className="w-7 shrink-0 font-mono text-sm tabular-nums text-gold-ink">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[1.02rem] text-ink">{c}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <div className="border-t border-hairline" />
      <Section id="sources" title="Sources & methodology">
        <p className="max-w-measure text-[0.95rem] leading-relaxed text-ink-soft">
          Every factual claim in this briefing is traced to one of the sources below. Reported or unconfirmed items are
          marked as such in the text.
        </p>
        {b.sources.length ? (
          <ol className="mt-6 grid max-w-[60rem] gap-x-10 gap-y-4 md:grid-cols-2">
            {b.sources.map((s) => (
              <li key={s.n} className="flex gap-3 text-sm leading-relaxed">
                <span className="w-6 shrink-0 text-right font-mono tabular-nums text-gold-ink">{s.n}</span>
                <span className="min-w-0">
                  <span className="block font-mono text-[0.7rem] uppercase tracking-eyebrow text-warm-gray">
                    {[s.publisher, formatDate(s.date, "short")].filter(Boolean).join(" · ")}
                  </span>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-ink underline decoration-hairline underline-offset-4 hover:decoration-gold"
                    >
                      {s.title}
                      <span className="sr-only"> (opens in a new tab)</span>
                      <span aria-hidden="true" className="ml-1 text-warm-gray">↗</span>
                    </a>
                  ) : (
                    <span className="text-ink">{s.title}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </Section>
    </article>
  );
}
