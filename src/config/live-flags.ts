/**
 * FDY-297 (ADM-2.4) — the Library flags as data. SERVER-ONLY (reads the Faraday service-role key).
 *
 * Each flag is read from the Faraday config store (app BL, v_effective_config) through the resolver. A value
 * set in the Workbench console wins within 60 s, with no redeploy. If the read fails, the key is unknown, the
 * value has the wrong type, or nobody has set a value, the flag keeps its current env value from ./flags
 * (NEXT_PUBLIC_LIBRARY_*), so this can never turn commerce on by itself: fail closed.
 *
 * Client components get the values from GET /api/library/flags (non-secret booleans only).
 */
import { flags } from "@/config/flags";
import { createResolver, resolveSettings } from "@/lib/config/resolver";

export const LIBRARY_APP_CODE = "BL";

/** env name → setting key. previewRoute and subscriberLive have no reader in the app yet (recorded_only). */
export const LIBRARY_SETTING_SPECS = {
  commerceOn: { key: "library_commerce_on", type: "boolean" as const, env: () => flags.commerceOn },
  anonTeaser: { key: "library_anon_teaser", type: "boolean" as const, env: () => flags.anonTeaser },
};

export type LiveLibraryFlags = { commerceOn: boolean; anonTeaser: boolean };

const resolver = createResolver();

export async function getLibraryFlags(r: Pick<typeof resolver, "resolve"> = resolver): Promise<LiveLibraryFlags> {
  const got = await resolveSettings(r, LIBRARY_APP_CODE, LIBRARY_SETTING_SPECS);
  return got.values;
}
