import { NextResponse } from "next/server";
import { runCatalogSync } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Airtable → Supabase read-model sync (§11.3). Runs on existing infra: a Vercel cron hits this
 * route on a cadence (or an Airtable on-publish webhook). Guarded by CRON_SECRET. No new vendor.
 *
 * Vercel Cron invokes the path with a GET and an `Authorization: Bearer <CRON_SECRET>` header, so
 * we accept GET *and* POST, and authorize on either that bearer token or an `x-cron-secret` header
 * (manual / webhook callers). Previously this route was POST-only + x-cron-secret, so the scheduled
 * cron got a 405 and the catalog cache never populated.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true; // Vercel cron + manual
  if (req.headers.get("x-cron-secret") === secret) return true; // manual / back-compat
  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
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

export const GET = handle;
export const POST = handle;
