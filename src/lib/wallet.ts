import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Token balance via the REUSED Jurisdiction Watch wallet RPC (do not reimplement — Boundaries).
 * balance = plan allowance + Σ grants − Σ unlocks, keyed by subscriber id.
 */
export async function getTokenBalance(subscriberId: string): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("jw_token_balance", { p_sub: subscriberId });
  if (error) throw new Error(`wallet balance read failed: ${error.message}`);
  return (data as number) ?? 0;
}
