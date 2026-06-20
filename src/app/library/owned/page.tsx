import { ReadingChair } from "@/components/ReadingChair";

export const dynamic = "force-dynamic";

/**
 * /library/owned — My briefings (§10.3). Owned = full read: opening a briefing shows the COMPLETE
 * deck (embedded Gamma viewer or canonical Gamma URL), not just the three preview slides.
 * Entitlements never expire.
 *
 * Wiring note: resolve the viewer via Clerk auth(), read library_entitlements joined to the cache,
 * and render the full Gamma embed. Gated until commerce-on; shown here as the structural shell.
 */
export default async function OwnedPage() {
  const owned: { slug: string; title: string; gammaUrl: string | null }[] = [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <a href="/library" className="font-mono text-xs text-gold underline">← back to the shelf</a>
      <h1 className="font-serif font-bold text-3xl text-forest mt-3">My Briefings</h1>
      <div className="double-rule mt-2 mb-4" />

      {owned.length === 0 ? (
        <div className="py-10 flex flex-col items-center text-center">
          <ReadingChair label="Nothing acquired yet — your owned volumes open to the full deck here." />
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {owned.map((o) => (
            <li key={o.slug} className="bg-forest text-warm-white rounded-sm p-4">
              <h2 className="font-serif font-bold text-gold">{o.title}</h2>
              <a href={o.gammaUrl ?? "#"} className="font-mono text-xs text-sage underline mt-2 inline-block">
                Open the full deck →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
