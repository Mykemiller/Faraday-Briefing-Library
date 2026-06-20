import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { subscriberIdForEmail } from "@/lib/identity";

export const runtime = "nodejs";

async function me() {
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  return subscriberIdForEmail(user?.primaryEmailAddress?.emailAddress);
}

/** GET — the persistent cart for the signed-in subscriber (survives device switch, §9.1). */
export async function GET() {
  const sub = await me();
  if (!sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("library_cart_items")
    .select("briefing_id,briefing_slug,added_at")
    .eq("subscriber_id", sub)
    .order("added_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    lines: (data ?? []).map((d) => ({ briefingId: d.briefing_id, briefingSlug: d.briefing_slug, addedAt: d.added_at })),
  });
}

/** POST — add a line (idempotent on the unique constraint). */
export async function POST(req: Request) {
  const sub = await me();
  if (!sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { briefingId, briefingSlug } = (await req.json()) as { briefingId?: string; briefingSlug?: string };
  if (!briefingId || !briefingSlug) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("library_cart_items")
    .upsert(
      { subscriber_id: sub, briefing_id: briefingId, briefing_slug: briefingSlug },
      { onConflict: "subscriber_id,briefing_id", ignoreDuplicates: true }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove a line. */
export async function DELETE(req: Request) {
  const sub = await me();
  if (!sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { briefingId } = (await req.json()) as { briefingId?: string };
  if (!briefingId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb.from("library_cart_items").delete().eq("subscriber_id", sub).eq("briefing_id", briefingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
