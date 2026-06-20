import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-ONLY — never import into a client component.
 * Used by the sync, the preview worker, and the commerce API routes (which enforce
 * ownership explicitly, mirroring the existing Jurisdiction Watch commerce path).
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role env not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
