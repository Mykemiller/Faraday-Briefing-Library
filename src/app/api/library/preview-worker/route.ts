import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { refreshBriefingPreviews } from "@/lib/gamma";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Preview worker (L10, §7.4). Vercel cron (or Supabase trigger) drains Available briefings whose
 * previews are stale/absent, calls the Gamma native export API, and writes content-addressed PNGs
 * to Supabase Storage. Skips re-export when the hash is unchanged. No headless browser, no new vendor.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  // Batch: Available briefings missing previews or flagged for backfill (bounded per run).
  const { data, error } = await sb
    .from("library_catalog_cache")
    .select("id,gamma_id,gamma_updated_at,preview_hash")
    .eq("status", "Available")
    .or("preview_slides.is.null,preview_backfill_needed.eq.true")
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Record<string, unknown>[] = [];
  for (const row of data ?? []) {
    try {
      const r = await refreshBriefingPreviews(row as any);
      results.push({ id: (row as any).id, ...r });
    } catch (e) {
      results.push({ id: (row as any).id, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
