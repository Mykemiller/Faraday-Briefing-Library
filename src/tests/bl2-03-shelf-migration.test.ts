import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMigration, loadInputs, parseCsv } from "../../scripts/bl2-03/build-migration.mjs";

const root = resolve(__dirname, "../..");
const MIGRATION = resolve(root, "supabase/migrations/20261109160000_bl2_03_tier_and_type.sql");

// BL2-03 (FDY-279): the committed migration must be exactly what the generator produces from the
// committed inputs, must carry none of the three destructive statement kinds (the unattended-run
// rule), and must encode the Founder-approved 467-row target shelf.

describe("BL2-03 shelf migration", () => {
  const inputs = loadInputs();
  const generated = buildMigration(inputs);
  const committed = readFileSync(MIGRATION, "utf8");

  it("is byte-identical to the generator output (edit the inputs, regenerate — never hand-edit)", () => {
    expect(committed).toBe(generated);
  });

  it("contains no destructive statement kinds, comments included", () => {
    for (const word of ["delete", "drop", "truncate"]) {
      expect(new RegExp(word, "i").test(committed), `migration contains "${word}"`).toBe(false);
    }
  });

  it("ships with the dry-run flag off", () => {
    expect(committed).toContain("v_dry_run constant boolean := false;");
    expect(buildMigration(inputs, { dryRun: true })).toContain("v_dry_run constant boolean := true;");
  });

  it("loads the 347 tiered universe rows, 30 states and 15 countries", () => {
    expect(inputs.tiered).toHaveLength(347);
    expect(inputs.states.map((s) => s.jurisdiction_id)).toEqual([
      "US-VA", "US-TX", "US-OH", "US-GA", "US-WA", "US-CA", "US-IL", "US-AZ", "US-NJ", "US-MI",
      "US-NY", "US-PA", "US-NC", "US-IN", "US-TN", "US-KY", "US-UT", "US-IA", "US-FL", "US-MN",
      "US-WI", "US-OK", "US-KS", "US-AL", "US-NM", "US-OR", "US-NV", "US-CO", "US-MD", "US-MO",
    ]);
    // Ranks 26–30 are in scope here even though BL2-02 marked them in_scope=false (Founder raised 25 → 30).
    expect(inputs.states.slice(25).every((s) => s.in_scope === "false")).toBe(true);
    expect(inputs.countries).toHaveLength(15);
    expect(inputs.countries.every((c) => c.in_scope === "true")).toBe(true);
  });

  it("encodes the target table, page targets and lane quotas", () => {
    for (const expected of [
      "('theater', 'deep', 7)",
      "('sector', 'standard', 23)",
      "('thread', 'standard', 117)",
      "('company:company', 'deep', 45)",
      "('company:company', 'standard', 15)",
      "('company:company', 'profile', 165)",
      "('company:institution', 'profile', 50)",
      "('jurisdiction:state', 'standard', 30)",
      "('jurisdiction:country', 'standard', 15)",
    ]) expect(committed).toContain(expected);
    expect(committed).toContain("case t.tier when 'deep' then 12 when 'standard' then 9 when 'profile' then 2 end");
    expect(committed).toContain("(expected 467)");
    for (const lane of ["('theaters', 2)", "('domains', 6)", "('subdomains', 15)", "('companies', 25)", "('institutions', 10)", "('states', 6)", "('countries', 4)"]) {
      expect(committed).toContain(lane);
    }
  });

  it("pins a fill pool whose ranks are contiguous and disjoint from the universe", () => {
    const pool = inputs.pinned.fill_pool as [string, string, string, string, string, number, number][];
    expect(pool.map((r) => r[6])).toEqual(pool.map((_, i) => i + 1));
    const universeIds = new Set(inputs.tiered.map((r) => r.entity_id));
    const remapTargets = new Set((inputs.pinned.universe_remap as string[][]).map((r) => r[2]));
    for (const [uid] of pool) {
      expect(universeIds.has(uid), `${uid} is a universe company`).toBe(false);
      expect(remapTargets.has(uid), `${uid} is a remap target`).toBe(false);
    }
    expect(new Set(pool.map((r) => r[0])).size).toBe(pool.length);
  });

  it("re-link map covers every planned row that had no company link on 2026-11-06 (21 + 6)", () => {
    const relink = inputs.pinned.relink as string[][];
    expect(relink).toHaveLength(27);
    expect(new Set(relink.map((r) => r[0])).size).toBe(27);
    const unmatched = parseCsv(readFileSync(resolve(root, "docs/migration/unmatched-links-2026-11-06.csv"), "utf8"))
      .filter((r) => r.reason === "no_registry_row" && r.link_field === "Tracking Companies")
      .map((r) => r.airtable_record_id);
    expect(unmatched).toHaveLength(27);
    expect(new Set(relink.map((r) => r[0]))).toEqual(new Set(unmatched));
  });

  it("sidecars carry the dry-run outcome: 225 retired rows, 27 re-linked", () => {
    const retired = parseCsv(readFileSync(resolve(root, "docs/briefs/retired-placeholders.csv"), "utf8"));
    expect(retired).toHaveLength(225);
    expect(retired.every((r) => r.action === "retired")).toBe(true);
    const byReason = retired.reduce<Record<string, number>>((m, r) => ((m[r.reason_code] = (m[r.reason_code] ?? 0) + 1), m), {});
    expect(byReason).toEqual({ below_company_cut: 198, superseded_duplicate_row: 15, draft_no_single_entity: 11, no_resolvable_link: 1 });
    const relinked = parseCsv(readFileSync(resolve(root, "docs/briefs/relinked-placeholders.csv"), "utf8"));
    expect(relinked).toHaveLength(27);
  });
});
