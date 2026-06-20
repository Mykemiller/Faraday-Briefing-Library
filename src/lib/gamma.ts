import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PREVIEW_SLIDE_MAX } from "@/config/constants";

/**
 * Preview pipeline (L4, L10, §7.4).
 *
 * A worker calls Gamma's NATIVE EXPORT API (PNG) — no headless browser, no new vendor
 * (Boundaries). Images are written to Supabase Storage, content-addressed by
 * hash(airtable_record_id + gamma_updated_timestamp). Re-export is SKIPPED when the hash
 * is unchanged; a revised deck cache-busts globally for free.
 *
 * Preview shows the hypothesis-led opener + 1 substantive body slide, and NEVER the
 * "Faraday's Take" slide or the final "Sources & methodology" slide. Selecting slides
 * server-side makes the 3-slide limit a property of the data, not a hope about the UI.
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "library-previews";

export function previewHash(recordId: string, gammaUpdatedAt: string | null): string {
  return createHash("sha256").update(`${recordId}:${gammaUpdatedAt ?? ""}`).digest("hex").slice(0, 32);
}

/**
 * Choose which slide indexes are preview-eligible. We never include the Take or the final
 * Sources slide. Given a deck of n slides we take the opener and the first body slide,
 * capped at PREVIEW_SLIDE_MAX. (Slide roles come from Gamma metadata when available; the
 * default heuristic excludes the last slide as Sources and any slide tagged "take".)
 */
export function eligibleSlideIndexes(
  slides: { index: number; title?: string; role?: string }[]
): number[] {
  const isForbidden = (s: { title?: string; role?: string }, i: number, n: number) => {
    const t = `${s.title ?? ""} ${s.role ?? ""}`.toLowerCase();
    if (t.includes("faraday's take") || t.includes("faradays take") || t.includes("take")) return true;
    if (t.includes("sources") || t.includes("methodolog")) return true;
    if (i === n - 1) return true; // final slide defaults to Sources & methodology
    return false;
  };
  const n = slides.length;
  return slides
    .filter((s, i) => !isForbidden(s, i, n))
    .map((s) => s.index)
    .slice(0, PREVIEW_SLIDE_MAX);
}

export interface GammaExportResult {
  slidePngUrls: string[]; // Gamma-hosted temporary PNG urls for the eligible slides
  gammaUpdatedAt: string | null;
  slideCount: number;
}

/** Call the Gamma native export API for a deck. Returns eligible-slide PNG urls. */
export async function exportDeckPngs(gammaId: string): Promise<GammaExportResult> {
  const key = process.env.GAMMA_API_KEY;
  if (!key) throw new Error("GAMMA_API_KEY not configured");

  // Gamma native export → PNG. (Endpoint shape per Gamma export API; format=png, scope=slides.)
  const res = await fetch(`https://api.gamma.app/v1/decks/${gammaId}/export`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ format: "png", scope: "slides" }),
  });
  if (!res.ok) throw new Error(`Gamma export failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    updatedAt?: string;
    slides: { index: number; title?: string; role?: string; pngUrl: string }[];
  };
  const eligible = new Set(eligibleSlideIndexes(json.slides));
  return {
    slidePngUrls: json.slides.filter((s) => eligible.has(s.index)).map((s) => s.pngUrl),
    gammaUpdatedAt: json.updatedAt ?? null,
    slideCount: json.slides.length,
  };
}

/**
 * Process one briefing: export → content-address → store → write urls back to the cache.
 * Skips re-export when the preview hash is unchanged. Flags backfill when previews are absent.
 */
export async function refreshBriefingPreviews(row: {
  id: string;
  gamma_id: string | null;
  gamma_updated_at: string | null;
  preview_hash: string | null;
}): Promise<{ skipped: boolean; slides: string[] | null; backfill: boolean }> {
  const sb = supabaseAdmin();

  if (!row.gamma_id) {
    await sb.from("library_catalog_cache").update({ preview_backfill_needed: true }).eq("id", row.id);
    return { skipped: false, slides: null, backfill: true };
  }

  const exported = await exportDeckPngs(row.gamma_id);
  const hash = previewHash(row.id, exported.gammaUpdatedAt ?? row.gamma_updated_at);
  if (row.preview_hash === hash) return { skipped: true, slides: null, backfill: false };

  const urls: string[] = [];
  for (let i = 0; i < exported.slidePngUrls.length; i++) {
    const src = await fetch(exported.slidePngUrls[i]);
    const bytes = new Uint8Array(await src.arrayBuffer());
    const path = `${row.id}/${hash}/${i}.png`;
    const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  const slides = urls.length ? urls : null;
  await sb
    .from("library_catalog_cache")
    .update({
      preview_slides: slides,
      preview_hash: hash,
      gamma_updated_at: exported.gammaUpdatedAt ?? row.gamma_updated_at,
      preview_backfill_needed: slides === null,
    })
    .eq("id", row.id);

  return { skipped: false, slides, backfill: slides === null };
}
