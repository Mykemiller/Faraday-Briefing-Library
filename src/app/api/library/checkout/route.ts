import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { subscriberIdForEmail } from "@/lib/identity";
import { flags } from "@/config/flags";

export const runtime = "nodejs";

/**
 * Atomic, idempotent checkout (§10). The whole transaction lives in the library_checkout RPC;
 * this route just authenticates, gates on commerce-on, and passes the session idempotency token.
 * A duplicate token replays the prior result — no double-debit (L2).
 */
export async function POST(req: Request) {
  // Commerce stays OFF until FAR-16 (wallet generalization) + FAR-46 (meter) clear.
  if (!flags.commerceOn) {
    return NextResponse.json({ error: "commerce_off", message: "Checkout is not yet enabled." }, { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const subscriberId = await subscriberIdForEmail(email);
  if (!subscriberId) return NextResponse.json({ error: "no_subscriber" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { idempotencyToken?: string };
  const token = body.idempotencyToken;
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ error: "bad_idempotency_token" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("library_checkout", {
    p_sub: subscriberId,
    p_idempotency_token: token,
  });
  if (error) return NextResponse.json({ error: "checkout_failed", detail: error.message }, { status: 500 });

  const result = data as Record<string, unknown>;
  if (result?.error) {
    // insufficient_tokens → client deep-links to the existing top-up/Stripe flow (§10).
    return NextResponse.json(result, { status: result.error === "insufficient_tokens" ? 402 : 409 });
  }
  return NextResponse.json(result);
}
