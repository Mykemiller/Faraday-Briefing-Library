import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resolve the commerce identity. Clerk is the auth front; the REUSED wallet keys on
 * public.subscribers(id), resolved by email. Returns null when not signed in / no subscriber
 * row yet (anonymous browsing is allowed — §4.1).
 *
 * NOTE: wire `auth()` from @clerk/nextjs/server in the route; this helper takes the email so
 * it stays testable and free of request-context coupling.
 */
export async function subscriberIdForEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const sb = supabaseAdmin();
  const { data } = await sb.from("subscribers").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}
