import { supabaseServer } from "@/lib/supabase/server";
import { getAvailabilityCounts } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * /library/blueprint — the Intelligence Blueprint (L9, §7.8). A high-craft map of FORTHCOMING
 * coverage — Faraday's pipeline rendered as architecture, not as empty shelves.
 *
 * CANON FLAGS (do not resolve here — §18): "Intelligence Blueprint" is net-new naming pending
 * Myke sign-off, and the taxonomy counts (18/30/7 vs IDF 4.0 23/116 vs 59 placeholders) don't
 * reconcile — so the Blueprint maps live records but does NOT advertise a coverage count as canon.
 */
export default async function BlueprintPage() {
  const sb = supabaseServer();
  const counts = await getAvailabilityCounts();

  // Forthcoming coverage grouped by Domain, from live placeholder records (numbers are live).
  const { data } = await sb
    .from("library_catalog_cache")
    .select("domains,companies,subdomains")
    .eq("status", "Coming Soon");

  const byDomain = new Map<string, number>();
  for (const r of (data as any[]) ?? []) {
    const d = (r.domains?.[0] as string) ?? "Unshelved";
    byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
  }
  const sections = [...byDomain.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <a href="/library" className="font-mono text-xs text-gold underline">← back to the shelf</a>
      <h1 className="font-serif font-bold text-3xl text-forest mt-3">The Intelligence Blueprint</h1>
      <div className="double-rule mt-2 mb-4" />
      <p className="text-forest/80 max-w-2xl">
        The shape of Faraday’s coverage. {counts.availableCount} volumes are on the shelf today;{" "}
        {counts.comingSoonCount} are forthcoming — mapped here as architecture, not absence.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(([domain, n]) => (
          <section key={domain} className="bg-cream rounded-sm p-4 border border-forest/10">
            <h2 className="font-serif font-bold text-forest">{domain}</h2>
            <p className="font-mono text-sm text-forest/70 mt-1">
              Forthcoming research: {n} {n === 1 ? "monograph" : "monographs"}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
