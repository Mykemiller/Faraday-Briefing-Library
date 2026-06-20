import { supabaseAdmin } from "@/lib/supabase/admin";
import { BRIEFING_METER_KEY } from "@/config/constants";

/**
 * Read the Briefing Library token meter from Supabase product_meters.
 * The VALUE is Myke-governed (FAR-46); this reader binds to it so the storefront never
 * hardcodes the price (§8). Returns null when the meter is unset (commerce stays off).
 */
export async function getBriefingMeter(): Promise<{ tokensCost: number; status: string } | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("product_meters")
    .select("tokens_cost,status")
    .eq("product_key", BRIEFING_METER_KEY)
    .maybeSingle();
  if (error || !data || data.tokens_cost == null) return null;
  return { tokensCost: data.tokens_cost, status: data.status };
}
