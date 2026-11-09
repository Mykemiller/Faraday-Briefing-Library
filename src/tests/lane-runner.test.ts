import { describe, expect, it, vi } from "vitest";
import { createStatusLog } from "../../scripts/statuslog.mjs";
import {
  AUTO_ID,
  CRAWLER_ID,
  LANES,
  assertServiceRole,
  buildDraftRow,
  createFixtureDb,
  decodeJwtRole,
  loadFixtures,
  matchesLane,
  parseArgs,
  runLane,
  selectCandidates,
} from "../../scripts/lanes/run.mjs";
import { TEMPLATE_SKELETONS, generate } from "../../scripts/lanes/generate.mjs";

const NOW = () => new Date("2026-11-09T15:04:00Z");
const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const fixtures = loadFixtures();

function harness(overrides: Record<string, unknown> = {}) {
  const db = createFixtureDb(fixtures);
  const out = vi.fn();
  const statuslog = createStatusLog({ token: undefined, now: NOW, out }); // no token ⇒ prints, never fetches
  return { db, out, statuslog, run: (o: Record<string, unknown>) => runLane({ lane: "domains", db, statuslog, now: NOW, out, ...overrides, ...o } as any) };
}

describe("lane runner — guards", () => {
  it("parses arguments and rejects unknown lanes / bad quotas", () => {
    expect(parseArgs(["--lane", "theaters", "--quota", "3", "--dry-run"])).toMatchObject({ lane: "theaters", quota: 3, dryRun: true });
    expect(() => parseArgs([])).toThrow(/--lane/);
    expect(() => parseArgs(["--lane", "keyplayers"])).toThrow(/one of/);
    expect(() => parseArgs(["--lane", "theaters", "--quota", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--lane", "theaters", "--bogus"])).toThrow(/unknown argument/);
  });

  it("refuses to run unless the key's role is service_role", () => {
    expect(decodeJwtRole(jwt({ role: "service_role" }))).toBe("service_role");
    expect(decodeJwtRole(jwt({ role: "anon" }))).toBe("anon");
    expect(decodeJwtRole("sb_publishable_not_a_jwt")).toBeNull();
    expect(() => assertServiceRole(undefined)).toThrow(/not set/);
    expect(() => assertServiceRole(jwt({ role: "anon" }))).toThrow(/not service_role/);
    expect(() => assertServiceRole(jwt({ role: "authenticated" }))).toThrow(/not service_role/);
    expect(() => assertServiceRole("garbage")).toThrow(/unreadable/);
    expect(() => assertServiceRole(jwt({ role: "service_role" }))).not.toThrow();
  });
});

describe("lane runner — selection", () => {
  it("maps each lane to the right briefs and never selects published or untiered rows", () => {
    const pick = (lane: string) => selectCandidates(fixtures.briefings, { lane, limit: 50 }).map((b: any) => b.title);
    expect(pick("theaters")).toEqual(["The Power Reckoning", "The Inference Economy"]);
    expect(pick("domains")).toEqual(["Grid & Regulatory", "Thermal & Power Convergence"]); // the bad-tier row is eligible; it fails at generate()
    expect(pick("subdomains")).toEqual(["Interconnection Queue & Grid Access"]);
    expect(pick("companies")).toEqual(["CoreWeave"]);
    expect(pick("institutions")).toEqual(["Lawrence Berkeley National Laboratory"]);
    expect(pick("states")).toEqual(["Texas"]);
    expect(pick("countries")).toEqual(["Germany"]);
    const all = LANES.flatMap((l: string) => pick(l));
    expect(all).not.toContain("Published theater brief (never selected)");
    expect(all).not.toContain("Untiered sector brief (never selected)");
  });

  it("company briefs with a company_id go to companies, institution-only ones to institutions", () => {
    const both = { briefing_type: "company", company_id: "cmp_x", institution_id: "inst_y" };
    expect(matchesLane(both, "companies")).toBe(true);
    expect(matchesLane(both, "institutions")).toBe(false);
    expect(matchesLane({ briefing_type: "jurisdiction", jurisdiction_id: "US-VA" }, "countries")).toBe(false);
    expect(matchesLane({ briefing_type: "jurisdiction", jurisdiction_id: "GB" }, "states")).toBe(false);
  });

  it("honours the keyset cursor and the quota", () => {
    const first = selectCandidates(fixtures.briefings, { lane: "theaters", limit: 1 });
    expect(first).toHaveLength(1);
    const next = selectCandidates(fixtures.briefings, { lane: "theaters", afterId: first[0].id, limit: 5 });
    expect(next.map((b: any) => b.title)).toEqual(["The Inference Economy"]);
  });
});

describe("generate() stub and draft row", () => {
  it("returns the tier skeleton, a placeholder thesis and empty source_refs", async () => {
    const g = await generate({ title: "T", tier: "standard" }, { now: NOW() });
    expect(g.stub).toBe(true);
    expect(g.source_refs).toEqual([]);
    expect(g.hypothesis).toMatch(/PLACEHOLDER/);
    expect(g.contents).toHaveLength(TEMPLATE_SKELETONS.standard.length);
    expect(g.contents[0]).toMatch(/^## Cover/);
    expect(g.contents.at(-1)).toMatch(/^## Sources & methodology/);
    expect(g.byline).toBe("Gilbert Faraday");
    expect(g.evidence_to).toBe("2026-11-09T15:04:00.000Z");
    expect(g.evidence_from).toBe("2026-05-09T15:04:00.000Z"); // Standard = 6 months
    expect((await generate({ title: "P", tier: "profile" })).byline).toBeNull();
    await expect(generate({ title: "x", tier: "brief" })).rejects.toThrow(/unknown tier/);
  });

  it("stages version+1 as kind=draft/status=draft with job=lane-<lane> and no live-row fields touched", async () => {
    const brief = fixtures.briefings.find((b: any) => b.title === "The Inference Economy");
    const row = buildDraftRow(brief, await generate(brief, { now: NOW() }), "theaters");
    expect(row).toMatchObject({ briefing_id: brief.id, version: 4, kind: "draft", status: "draft", job: "lane-theaters", tier: "deep", briefing_type: "theater", created_by: CRAWLER_ID });
    expect(row.source_refs).toEqual([]);
    expect(row.published_at).toBeNull();
    expect(row.last_refreshed).toBeNull();
    expect(row).not.toHaveProperty("id");
    expect(row).toHaveProperty("jurisdiction_id", null); // fixtures carry the BL2-01 column
    const legacy = buildDraftRow({ id: "x", title: "t", tier: "deep", briefing_type: "theater", version: 1 }, await generate({ title: "t", tier: "deep" }), "theaters");
    expect(legacy).not.toHaveProperty("jurisdiction_id"); // pre-BL2-01 rows never send the column
  });
});

describe("lane runner — a run", () => {
  it("drafts up to quota, logs DRAFTED per brief, checkpoints the cursor, writes one health row", async () => {
    const { db, run } = harness();
    const s = await run({ lane: "theaters" });
    expect(s.found).toBe(2);
    expect(s.drafted).toBe(2);
    expect(s.failed).toBe(0);
    expect(db.writes.versions).toHaveLength(2);
    expect(db.writes.versions.map((v: any) => [v.version, v.job, v.kind, v.status])).toEqual([[2, "lane-theaters", "draft", "draft"], [4, "lane-theaters", "draft", "draft"]]);
    expect(db.writes.cursors).toHaveLength(2); // checkpoint after every brief
    expect(s.cursor_out.last_id).toBe(db.writes.versions[1].briefing_id);
    expect(db.writes.health).toHaveLength(1);
    expect(db.writes.health[0]).toMatchObject({ auto_id: AUTO_ID, crawler_id: CRAWLER_ID, artifacts_found: 2, artifacts_new: 2, artifacts_duped: 0, success: true, errors: [] });
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]).toMatch(/^2026-11-09 09:04 CT · fx000100 · theaters · deep · DRAFTED · PASS · Staged draft v2 of "The Power Reckoning"/);
  });

  it("per-brief try/catch: a bad tier fails that brief, the run continues, health row records it", async () => {
    const { db, run } = harness();
    const s = await run({ lane: "domains" });
    expect(s.found).toBe(2);
    expect(s.drafted).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.errors[0].message).toMatch(/unknown tier "brief"/);
    expect(db.writes.versions).toHaveLength(1);
    expect(db.writes.health[0]).toMatchObject({ success: false, artifacts_new: 1 });
    expect(db.writes.health[0].errors).toHaveLength(1);
    expect(s.lines.find((l: string) => l.includes("FAIL"))).toMatch(/· domains · brief · DRAFTED · FAIL · Drafting failed: unknown tier/);
    expect(s.cursor_out.last_id).toBe("fx000400-0004-4000-8000-000000000004"); // cursor moves past the failure
  });

  it("a second run resumes from the cursor; when the lane is exhausted it wraps", async () => {
    const { db, run } = harness();
    await run({ lane: "theaters", quota: 1 });
    const s2 = await run({ lane: "theaters", quota: 1 });
    expect(s2.cursor_in.last_id).toBe("fx000100-0001-4000-8000-000000000001");
    expect(s2.drafted).toBe(1);
    const s3 = await run({ lane: "theaters", quota: 1 });
    expect(s3.found).toBe(0);
    expect(s3.cursor_out).toMatchObject({ last_id: null });
    expect(db.writes.health).toHaveLength(3);
    const s4 = await run({ lane: "theaters", quota: 1 });
    expect(s4.found).toBe(1);
    expect(s4.duplicates).toBe(1); // v2 already staged ⇒ unique conflict ⇒ FAIL line, nothing written
    expect(s4.lines[0]).toMatch(/DRAFTED · FAIL · Draft v2 already staged/);
    expect(db.writes.versions).toHaveLength(2);
  });

  it("--quota overrides daily_quota", async () => {
    const { run } = harness();
    const s = await run({ lane: "theaters", quota: 1 });
    expect(s.quota).toBe(1);
    expect(s.drafted).toBe(1);
  });

  it("a blocked lane writes only its health row", async () => {
    const { db, run } = harness();
    const s = await run({ lane: "institutions" });
    expect(s.blocked).toMatch(/paused/);
    expect(db.writes.versions).toHaveLength(0);
    expect(db.writes.health).toHaveLength(1);
    expect(db.writes.health[0].notes).toMatch(/blocked: fixture/);
    expect(s.lines).toHaveLength(0);
  });

  it("dry-run writes nothing — no version rows, no cursor, no health row — but prints every line", async () => {
    const { db, out, run } = harness();
    const s = await run({ lane: "states", dryRun: true });
    expect(s.drafted).toBe(1);
    expect(db.writes.versions).toHaveLength(0);
    expect(db.writes.cursors).toHaveLength(0);
    expect(db.writes.health).toHaveLength(0);
    const printed = out.mock.calls.map((c) => String(c[0]));
    expect(printed.some((l) => l.includes("· states · standard · DRAFTED · PASS ·"))).toBe(true);
    expect(printed.some((l) => l.includes("would write automation_health_log"))).toBe(true);
  });

  it("refuses to run without a lane row unless --quota is given", async () => {
    const db = createFixtureDb({ lanes: [], briefings: fixtures.briefings });
    const statuslog = createStatusLog({ token: undefined, now: NOW, out: () => {} });
    await expect(runLane({ lane: "theaters", db, statuslog, now: NOW, out: () => {} })).rejects.toThrow(/no row for lane/);
    const s = await runLane({ lane: "theaters", db, statuslog, now: NOW, out: () => {}, quota: 1 });
    expect(s.drafted).toBe(1);
    const missing = { ...db, getLane: async () => undefined };
    await expect(runLane({ lane: "theaters", db: missing, statuslog, now: NOW, out: () => {} })).rejects.toThrow(/BL2-01/);
  });
});
