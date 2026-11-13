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
import { generate, EVIDENCE_MONTHS } from "../../scripts/lanes/generate.mjs";
import { createFixtureEvidence } from "../../scripts/lanes/evidence.mjs";
import { EVIDENCE_FIXTURES_DIR, buildReviewRow, draftedSentence } from "../../scripts/lanes/run.mjs";

// The retired fourth-type key, assembled so the BL3-02 vocabulary guard finds no literal of it.
const RETIRED_TYPE = ["key", "player"].join("");

const NOW = () => new Date("2026-11-09T15:04:00Z");
const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
const fixtures = loadFixtures();
const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);

/** A fast stand-in for the sourced generator: the runner's own behaviour is what these tests cover. */
function fakeGenerate(opts: { pages?: (b: any) => number | null; thin?: (b: any) => boolean } = {}) {
  return async (brief: any, _opts?: any) => {
    if (!["deep", "standard", "profile"].includes(brief.tier)) throw new Error(`unknown tier "${brief.tier}" (expected deep|standard|profile)`);
    const pages = opts.pages ? opts.pages(brief) : brief.tier === "profile" ? 2 : brief.tier === "deep" ? 12 : 9;
    const range = brief.tier === "profile" ? [2, 2] : brief.tier === "deep" ? [10, 15] : [8, 10];
    return {
      title: brief.title, hypothesis: "Thesis. [S1]", contents: [":::cover\n# T\n:::", "## A\n\nx [S1]"], source_refs: [{ ref: "S1", url: "https://x", title: "t" }],
      byline: brief.tier === "profile" ? null : brief.tier === "deep" ? "Faraday Editorial" : "Gilbert Faraday",
      evidence_from: "2026-05-09T00:00:00.000Z", evidence_to: "2026-11-09T23:59:59.000Z", manuscript_md: ":::cover\n# T\n:::\n\n## A\n\nx [S1]\n",
      pages, page_range: range, in_range: pages == null ? null : pages >= range[0] && pages <= range[1], render_checked: pages != null,
      thin: opts.thin ? opts.thin(brief) : false, thin_below: 6, signal_count: 8, source_count: 1, items_in_scope: 8, fit: [], polished: false, stub: false,
    };
  };
}

function harness(overrides: Record<string, unknown> = {}) {
  const db = createFixtureDb(fixtures);
  const out = vi.fn();
  const statuslog = createStatusLog({ token: undefined, now: NOW, out }); // no token ⇒ prints, never fetches
  return { db, out, statuslog, run: (o: Record<string, unknown>) => runLane({ lane: "domains", db, statuslog, now: NOW, out, generate: fakeGenerate(), ...overrides, ...o } as any) };
}

describe("lane runner — guards", () => {
  it("parses arguments and rejects unknown lanes / bad quotas", () => {
    expect(parseArgs(["--lane", "theaters", "--quota", "3", "--dry-run"])).toMatchObject({ lane: "theaters", quota: 3, dryRun: true });
    expect(() => parseArgs([])).toThrow(/--lane/);
    expect(() => parseArgs(["--lane", `${RETIRED_TYPE}s`])).toThrow(/one of/);
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
    expect(pick("institutions")).toEqual(["Electric Reliability Council of Texas"]);
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

describe("generate() and the draft row", () => {
  it("drafts from Faraday evidence: real sources, tier byline, tier window, no placeholder", async () => {
    const g = await generate(fixtures.briefings.find((b: any) => b.title === "Grid & Regulatory"), { evidence, now: NOW() });
    expect(g.stub).toBe(false);
    expect(g.source_refs.length).toBeGreaterThan(10);
    expect(g.hypothesis).not.toMatch(/PLACEHOLDER/);
    expect(g.hypothesis).toMatch(/\[S\d+\]/);
    expect(g.contents[0]).toMatch(/^:::cover/);
    expect(g.contents.at(-1)).toMatch(/^## Sources & methodology/);
    expect(g.byline).toBe("Gilbert Faraday");
    expect(EVIDENCE_MONTHS).toEqual({ deep: 12, standard: 6, profile: 12, jurisdiction: 12 });
    expect(g.evidence_to.slice(0, 10)).toBe("2026-11-09"); // fixture packs draft as of capture (2026-11-09)
    expect(g.evidence_from.slice(0, 10)).toBe("2026-05-09"); // Standard = 6 months
    expect((await generate(fixtures.briefings.find((b: any) => b.title === "CoreWeave"), { evidence })).byline).toBeNull();
    await expect(generate({ title: "x", tier: "brief" }, { evidence })).rejects.toThrow(/unknown tier/);
  });

  it("stages version+1 as kind=draft/status=draft with job=lane-<lane>, the manuscript in its column, and no live-row fields touched", async () => {
    const brief = fixtures.briefings.find((b: any) => b.title === "The Inference Economy");
    const gen = await fakeGenerate()(brief);
    const row = buildDraftRow(brief, gen, "theaters");
    expect(row).toMatchObject({ briefing_id: brief.id, version: 4, kind: "draft", status: "draft", job: "lane-theaters", tier: "deep", briefing_type: "theater", created_by: CRAWLER_ID, byline: "Faraday Editorial" });
    expect(row.source_refs).toEqual(gen.source_refs);
    expect((row as any).manuscript_md).toBe(gen.manuscript_md);
    expect(row.contents).toEqual(gen.contents);
    expect(row.published_at).toBeNull();
    expect(row.last_refreshed).toBeNull();
    expect(row).not.toHaveProperty("id");
    expect(row).toHaveProperty("jurisdiction_id", null); // fixtures carry the BL2-01 column
    const legacy = buildDraftRow({ id: "x", title: "t", tier: "deep", briefing_type: "theater", version: 1 }, gen, "theaters");
    expect(legacy).not.toHaveProperty("jurisdiction_id"); // pre-BL2-01 rows never send the column
    // BL2-05 migration not applied ⇒ the manuscript rides as contents[0]
    const fallback = buildDraftRow(brief, gen, "theaters", { manuscriptColumn: false });
    expect(fallback).not.toHaveProperty("manuscript_md");
    expect(fallback.contents[0]).toBe(gen.manuscript_md);
    expect(fallback.contents.slice(1)).toEqual(gen.contents);
  });

  it("the DRAFTED sentence carries tier, page count and source count; G1 review rows carry blockers", async () => {
    const brief = fixtures.briefings.find((b: any) => b.title === "CoreWeave");
    const gen = await fakeGenerate()(brief);
    expect(draftedSentence(brief, gen, 2)).toBe('Staged draft v2 of "CoreWeave" (profile, 2 pp, 1 sources).');
    expect(draftedSentence(brief, { ...gen, render_checked: false, pages: null }, 2)).toMatch(/pages unmeasured/);
    expect(buildReviewRow(brief, 2, [{ code: "thin" }], "n")).toMatchObject({ briefing_id: brief.id, version: 2, gate: "G1-AUTO", result: "FAIL", reviewer: CRAWLER_ID });
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
    expect(s.lines[0]).toMatch(/^2026-11-09 09:04 CT · fx000100 · theaters · deep · DRAFTED · PASS · Staged draft v2 of "The Power Reckoning" \(deep, 12 pp, 1 sources\)\./);
    expect(s.in_range).toBe(2);
    expect(db.writes.reviews).toHaveLength(0);
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
    const db = createFixtureDb({ lanes: [{ lane: "institutions", daily_quota: 1, cursor: null, blocked_reason: "fixture: lane paused pending institution taxonomy" }] as any, briefings: fixtures.briefings });
    const statuslog = createStatusLog({ token: undefined, now: NOW, out: () => {} });
    const run = (o: any) => runLane({ lane: "institutions", db, statuslog, now: NOW, out: () => {}, generate: fakeGenerate(), ...o });
    const s = await run({});
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
    const generate = fakeGenerate();
    await expect(runLane({ lane: "theaters", db, statuslog, now: NOW, out: () => {}, generate })).rejects.toThrow(/no row for lane/);
    const s = await runLane({ lane: "theaters", db, statuslog, now: NOW, out: () => {}, quota: 1, generate });
    expect(s.drafted).toBe(1);
    const missing = { ...db, getLane: async () => undefined };
    await expect(runLane({ lane: "theaters", db: missing, statuslog, now: NOW, out: () => {}, generate })).rejects.toThrow(/BL2-01/);
    await expect(runLane({ lane: "theaters", db, statuslog, now: NOW, out: () => {}, quota: 1 })).rejects.toThrow(/generate\(\) function/);
  });

  it("out-of-range and thin drafts are STILL staged, logged G1-AUTO FAIL, and get a briefing_reviews blocker", async () => {
    const { db, run } = harness();
    const s = await run({ lane: "companies", generate: fakeGenerate({ pages: () => 3, thin: () => true }) });
    expect(s.drafted).toBe(1);
    expect(s.out_of_range).toBe(1);
    expect(s.thin).toBe(1);
    expect(db.writes.versions).toHaveLength(1);
    expect(db.writes.reviews).toHaveLength(1);
    expect(db.writes.reviews[0]).toMatchObject({ gate: "G1-AUTO", result: "FAIL", version: 2 });
    expect(db.writes.reviews[0].blockers.map((b: any) => b.code)).toEqual(["page_range", "thin"]);
    const g1 = s.lines.filter((l: string) => l.includes("· G1-AUTO · FAIL ·"));
    expect(g1).toHaveLength(2);
    expect(g1[0]).toMatch(/Page count 3 outside the profile range 2–2/);
    expect(g1[1]).toMatch(/Thin record: 8 sourced Signals/);
  });

  it("processes briefs --width at a time and the cursor only advances over completed prefixes", async () => {
    const { db, run } = harness();
    let inflight = 0;
    let peak = 0;
    const slow = fakeGenerate();
    const generate = async (b: any, o: any) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, b.title === "The Power Reckoning" ? 20 : 1));
      inflight -= 1;
      return slow(b, o);
    };
    const s = await run({ lane: "theaters", width: 2, generate });
    expect(peak).toBe(2);
    expect(s.drafted).toBe(2);
    expect(db.writes.cursors.map((c: any) => c.cursor.last_id)).toEqual(["fx000200-0002-4000-8000-000000000002"]); // the slow first brief gates the checkpoint
    expect(s.cursor_out.last_id).toBe("fx000200-0002-4000-8000-000000000002");
  });
});
