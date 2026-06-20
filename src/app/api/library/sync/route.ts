import { NextResponse } from "next/server";
import { runCatalogSync } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Airtable → Supabase read-model sync (§11.3). Runs on existing infra: a Vercel cron hits this
 * route on a cadence (or an Airtable on-publish webhook). Guarded by CRON_SECRET. No new vendor.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const result = await runCatalogSync();
    // capExceeded is an INTERNAL flag (a V2 trigger) — never a subscriber-facing error (§11.3).
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
