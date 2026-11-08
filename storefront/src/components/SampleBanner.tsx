/** Shown on every page while local design fixtures are on. Never rendered on Vercel. */
export function SampleBanner() {
  return (
    <div role="note" className="bg-gold-light px-4 py-2 text-center font-mono text-xs uppercase tracking-eyebrow text-ink">
      Sample data · local design fixtures, not real briefings
    </div>
  );
}
