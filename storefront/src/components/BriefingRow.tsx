import Link from "next/link";
import { TIER_META, formatDate, type Briefing } from "@/lib/model";
import { entityFor } from "@/lib/entities";
import { EntityMark } from "./EntityMark";

export function eyebrow(b: Briefing): string {
  const parts: string[] = [];
  if (b.tier) parts.push(`${TIER_META[b.tier].label} · ${TIER_META[b.tier].pages}`);
  if (b.typeLabel) parts.push(b.typeLabel);
  return parts.join(" · ");
}

export function BriefingRow({ b }: { b: Briefing }) {
  const entity = entityFor(b.entityId);
  const date = formatDate(b.publishedAt, "short");
  const label = eyebrow(b);
  return (
    <li className="group relative grid grid-cols-1 gap-x-8 gap-y-2 border-b border-hairline py-7 transition-colors first:border-t md:grid-cols-[8.5rem_minmax(0,1fr)_12rem] md:py-8">
      <div className="font-mono text-xs uppercase tracking-eyebrow text-warm-gray md:pt-1.5">
        {date ? <time dateTime={b.publishedAt ?? undefined}>{date}</time> : <span>Undated</span>}
      </div>
      <div className="min-w-0">
        {label ? <p className="font-mono text-[0.7rem] uppercase tracking-eyebrow text-gold-ink">{label}</p> : null}
        <h2 className="mt-2 font-serif text-2xl font-semibold leading-snug text-ink">
          <Link
            href={`/b/${b.id}`}
            className="decoration-gold decoration-2 underline-offset-[6px] after:absolute after:inset-0 after:content-[''] group-hover:underline focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-gold"
          >
            {b.title}
          </Link>
        </h2>
        {b.hypothesis ? <p className="mt-3 line-clamp-2 max-w-measure text-[0.98rem] leading-relaxed text-ink-soft">{b.hypothesis}</p> : null}
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-warm-gray">
          {b.byline ? <span>By {b.byline}</span> : null}
          <span>
            {b.sources.length} {b.sources.length === 1 ? "source" : "sources"}
          </span>
        </p>
      </div>
      <div className="md:pt-1.5 md:text-right">
        <EntityMark entity={entity} />
      </div>
    </li>
  );
}
