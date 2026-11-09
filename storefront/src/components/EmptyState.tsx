import Link from "next/link";
import { ShelfIllustration } from "./ShelfIllustration";

export function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <section aria-labelledby="empty-title" className="flex flex-col items-center border-b border-hairline px-4 py-16 text-center sm:py-20">
      <ShelfIllustration />
      <h2 id="empty-title" className="mt-8 font-serif text-3xl font-semibold text-ink">
        {filtered ? "Nothing on this shelf" : "The shelf is being stocked"}
      </h2>
      <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-ink-soft">
        {filtered
          ? "No published briefing matches these filters. Try another shelf, tier or jurisdiction, or see the whole library."
          : "No briefings are published yet. Each one appears here as soon as it clears editorial review, newest first."}
      </p>
      {filtered ? (
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center border border-forest px-5 font-sans text-sm font-medium text-forest transition-colors hover:bg-forest hover:text-paper"
        >
          Clear filters
        </Link>
      ) : null}
    </section>
  );
}
