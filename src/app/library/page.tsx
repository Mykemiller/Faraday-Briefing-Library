import { getShelfPage } from "@/lib/catalog";
import { getBriefingMeter } from "@/lib/meter";
import { supabaseServer } from "@/lib/supabase/server";
import { LibraryShell } from "@/components/LibraryShell";
import { flags } from "@/config/flags";
import type { CatalogBriefing } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * /library — the shelf. Search-first, faceted, virtualized (Phase 1). Served on the flag-gated
 * preview route; subscriber-live exposure waits on FAR-132. Curated row is bound to live data.
 */
export default async function LibraryPage() {
  const [page, meter] = await Promise.all([getShelfPage({ sort: "newest" }), getBriefingMeter()]);

  // Curated: most-downloaded available briefings (live data only — §7.7, Precision value).
  const sb = supabaseServer();
  const { data } = await sb
    .from("library_catalog_cache")
    .select("*")
    .eq("status", "Available")
    .order("download_count", { ascending: false })
    .limit(8);
  const curated = ((data as any[]) ?? []).map((r) => ({
    id: r.id, slug: r.slug, title: r.briefing_title, description: r.briefing_description,
    status: r.status, canonicalFlag: r.canonical_flag, gammaUrl: r.gamma_url, gammaId: r.gamma_id,
    themes: r.themes ?? [], domains: r.domains ?? [], subdomains: r.subdomains ?? [],
    companies: r.companies ?? [], downloadCount: r.download_count ?? 0, goLiveDate: r.go_live_date,
    previewSlides: r.preview_slides ?? null,
  })) as CatalogBriefing[];

  // Wallet balance is wired once commerce-on; until then the chip shows balance unavailable.
  const balance: number | null = flags.commerceOn ? null : null;

  return <LibraryShell initial={page} curated={curated} meter={meter?.tokensCost ?? null} balance={balance} />;
}
