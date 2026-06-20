import { createClient } from "@supabase/supabase-js";

/**
 * Anon Supabase client for read-model reads in server components. RLS applies.
 * The catalog cache is readable by any authenticated subscriber.
 */
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase anon env not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}
