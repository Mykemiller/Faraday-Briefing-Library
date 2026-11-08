import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-page px-4 py-24 sm:px-8">
      <p className="font-mono text-[0.72rem] uppercase tracking-eyebrow text-gold-ink">Not on the shelf</p>
      <h1 className="mt-4 font-serif text-4xl font-semibold text-ink">This briefing isn&rsquo;t published</h1>
      <p className="mt-4 max-w-measure text-lg leading-relaxed text-ink-soft">
        It may not be published yet, or it may have been retired.
      </p>
      <Link href="/" className="mt-8 inline-flex h-11 items-center border border-forest px-5 text-sm font-medium text-forest hover:bg-forest hover:text-paper">
        Back to the library
      </Link>
    </div>
  );
}
