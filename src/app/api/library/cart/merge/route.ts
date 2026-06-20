import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { subscriberIdForEmail } from "@/lib/identity";

export const runtime = "nodejs";

/**
 * Guest → authenticated cart merge (§9.4). The guest cart is a localStorage courier only;
 * on sign-in the buffered briefing ids POST here and are upserted into library_cart_items,
 * de-duplicating against existing rows. localStorage is then cleared by the client.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const user = await currentUser();
  const sub = await subscriberIdForEmail(user?.primaryEmailAddress?.emailAddress);
  if (!sub) return NextResponse.json({ error: "no_subscriber" }, { status: 403 });

  const { lines } = (await req.json()) as { lines?: { briefingId: string; briefingSlug: string }[] };
  if (!Array.isArray(lines) || lines.length === 0) return NextResponse.json({ ok: true, merged: 0 });

  const sb = supabaseAdmin();
  const rows = lines
    .filter((l) => l.briefingId && l.briefingSlug)
    .map((l) => ({ subscriber_id: sub, briefing_id: l.briefingId, briefing_slug: l.briefingSlug }));
  const { error } = await sb
    .from("library_cart_items")
    .upsert(rows, { onConflict: "subscriber_id,briefing_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, merged: rows.length });
}
