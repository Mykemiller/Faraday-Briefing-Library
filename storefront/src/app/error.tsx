"use client";

/** A failed read is NOT an empty library: say so plainly and offer a retry. */
export default function LibraryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-page px-4 py-24 sm:px-8">
      <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-gold-ink">Temporarily unavailable</p>
      <h1 className="mt-4 font-serif text-4xl font-semibold text-ink">The library could not be reached</h1>
      <p className="mt-4 max-w-measure text-lg leading-relaxed text-ink-soft">
        This is a connection problem on our side, not an empty shelf. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-11 items-center border border-forest bg-forest px-5 text-sm font-medium text-paper hover:bg-forest-mid"
      >
        Try again
      </button>
    </div>
  );
}
