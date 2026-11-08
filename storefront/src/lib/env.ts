/**
 * Read-only credentials guard.
 *
 * The storefront may only ever hold the Supabase anon (publishable) key. This module refuses to
 * return a key that is not one. It is an allow-list: a new-format publishable key, or a legacy
 * JWT whose `role` claim is exactly `anon`. Anything else throws before any request is made. The data plane is then
 * bounded by the BL-03 policy `briefings_anon_select_published` (anon may SELECT
 * `status = 'published'` only; anon holds no INSERT/UPDATE/DELETE grant).
 */
export type AnonConfig = { url: string; anonKey: string };

export function assertAnonKey(key: string): void {
  if (key.startsWith("sb_publishable_")) return;
  const parts = key.split(".");
  if (parts.length !== 3) throw new Error("Supabase key is neither a publishable key nor an anon JWT: the storefront is anon-only.");
  let role: unknown;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    role = (JSON.parse(json) as { role?: unknown }).role;
  } catch {
    throw new Error("Supabase key payload is unreadable.");
  }
  if (role !== "anon") throw new Error(`Refusing a Supabase key with role "${String(role)}": the storefront is anon-only.`);
}

export function anonConfig(env: Record<string, string | undefined> = process.env): AnonConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  assertAnonKey(anonKey);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a https://<ref>.supabase.co URL.");
  return { url: url.replace(/\/$/, ""), anonKey };
}
