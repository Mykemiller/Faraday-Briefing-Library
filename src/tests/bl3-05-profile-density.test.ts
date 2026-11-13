// BL3-05 (FDY-329): Profile lanes select by sourced-Signal density with a 6-Signal floor (skip, don't stage).
import { describe, expect, it, vi } from "vitest";
import { createStatusLog } from "../../scripts/statuslog.mjs";
import { EVIDENCE_FIXTURES_DIR, buildGenerator, closeGenerator, createEvidenceProbe, createFixtureDb, loadFixtures, parseArgs, runLane } from "../../scripts/lanes/run.mjs";
import { runAll } from "../../scripts/lanes/run-all.mjs";
import { generate } from "../../scripts/lanes/generate.mjs";
import { createFixtureEvidence } from "../../scripts/lanes/evidence.mjs";
import * as evidenceModule from "../../scripts/lanes/evidence.mjs";
import { PROFILE_THIN_BELOW } from "../../scripts/lanes/compose.mjs";
import {
  FETCH_FACTOR,
  PROFILE_FLOOR,
  SKIP_RECHECK_DAYS,
  THIN_SKIP,
  countSourcedSignals,
  freshSkipped,
  groupedInstitutionCounts,
  isCitableSource,
  isSourcedSignal,
  localIsCitableSource,
  preDraftGate,
  profileGate,
  rankCompanies,
  rankInstitutions,
} from "../../scripts/lanes/gates.mjs";

const NOW = () => new Date("2026-11-13T15:00:00Z");
const DAY = 86400000;
const iso = (msAgo: number) => new Date(NOW().getTime() - msAgo).toISOString();

const sig = (o: Record<string, unknown> = {}) => ({ ref_kind: "signal", url: "https://www.datacenterdynamics.com/en/news/x", publisher: "Data Center Dynamics", ...o });
const packOf = (n: number) => ({ items: Array.from({ length: n }, (_, i) => sig({ url: `https://www.datacenterdynamics.com/en/news/${i}` })) });

/** A fast stand-in for the sourced generator (the runner is what is under test). */
function fakeGenerate() {
  return async (brief: any) => ({
    title: brief.title, hypothesis: "Thesis. [S1]", contents: [":::cover\n# T\n:::", "## A\n\nx [S1]"], source_refs: [{ ref: "S1", url: "https://x", title: "t" }],
    byline: null, evidence_from: "2025-11-13T00:00:00.000Z", evidence_to: "2026-11-13T23:59:59.000Z", manuscript_md: ":::cover\n# T\n:::\n\n## A\n\nx [S1]\n",
    pages: 2, page_range: [2, 2], in_range: true, render_checked: true, thin: false, thin_below: 6, signal_count: 8, source_count: 1, items_in_scope: 8, fit: [], polished: false, stub: false,
  });
}

/** Synthetic Profile briefs whose id order is the REVERSE of their intended rank. */
function profileBriefs(lane: "companies" | "institutions", keys: string[]) {
  return keys.map((key, i) => ({
    id: `p${String(keys.length - i).padStart(2, "0")}00000-0000-4000-8000-000000000000`,
    title: `${key[0].toUpperCase()}${key.slice(1)} Corp`,
    tier: "profile",
    status: "planned",
    briefing_type: "company",
    version: 1,
    page_target: 2,
    company_id: lane === "companies" ? `cmp_${key}` : null,
    institution_id: lane === "institutions" ? `inst_${key}` : null,
    jurisdiction_id: null,
    key,
  }));
}

function harness(opts: { lane?: "companies" | "institutions"; briefs: any[]; counts: Record<string, number>; quota?: number; cursor?: any; rollup?: any[]; institutions?: any[]; institutionSignals?: any[]; versions?: any[] }) {
  const lane = opts.lane ?? "companies";
  const db = createFixtureDb({ lanes: [{ lane, daily_quota: opts.quota ?? 2, cursor: opts.cursor ?? null, blocked_reason: null }] as any, briefings: opts.briefs, rollup: opts.rollup ?? [], institutions: opts.institutions ?? [], institutionSignals: opts.institutionSignals ?? [], versions: opts.versions ?? [] });
  const out = vi.fn();
  const statuslog = createStatusLog({ token: undefined, now: NOW, out: () => {} });
  const fetched: string[] = [];
  const drafted: string[] = [];
  const gen = fakeGenerate();
  const fetchPack = async (b: any) => {
    fetched.push(b.key);
    return packOf(opts.counts[b.key] ?? 0);
  };
  const generateFn = async (b: any) => {
    drafted.push(b.key);
    return gen(b);
  };
  const run = (o: Record<string, unknown> = {}) => runLane({ lane, db, statuslog, now: NOW, out, generate: generateFn, fetchPack, ...o } as any);
  const stored = async () => (await db.getLane(lane)).cursor;
  return { db, out, run, fetched, drafted, stored };
}

// rollup so the rank is a > b > c > … (company ids run the other way)
const rollupFor = (briefs: any[]) => briefs.map((b, i) => ({ company_uid: b.company_id, mentions_30d: 100 - i, artifact_count: 0 }));

describe("gates.mjs — sourced Signal and the floor", () => {
  it("isCitableSource falls back to the local rule until FDY-330 exports one from evidence.mjs", () => {
    expect(typeof (evidenceModule as any).isCitableSource === "function" ? (evidenceModule as any).isCitableSource : localIsCitableSource).toBe(isCitableSource);
  });

  it("counts only Signals with a source_url and source name that pass isCitableSource", () => {
    expect(PROFILE_FLOOR).toBe(PROFILE_THIN_BELOW);
    expect(isSourcedSignal(sig())).toBe(true);
    expect(isSourcedSignal(sig({ publisher: "tpr.org" }))).toBe(true);
    expect(isSourcedSignal(sig({ url: "" }))).toBe(false);
    expect(isSourcedSignal(sig({ url: "/relative" }))).toBe(false);
    expect(isSourcedSignal(sig({ url: "https://faraday.ai/records/cmp_x" }))).toBe(false);
    expect(isSourcedSignal(sig({ publisher: "" }))).toBe(false);
    expect(isSourcedSignal(sig({ publisher: "Source" }))).toBe(false);
    expect(isSourcedSignal(sig({ publisher: 'Google News search: "CoreWeave" data center' }))).toBe(false);
    expect(isSourcedSignal(sig({ ref_kind: "record" }))).toBe(false);
    expect(isSourcedSignal(sig({ ref_kind: "artifact" }))).toBe(false);
    expect(countSourcedSignals({ items: [sig(), sig({ publisher: "Source" }), sig({ ref_kind: "record" }), sig()] })).toBe(2);
  });

  it("profileGate: 5 is thin (skipped), 6 clears; preDraftGate dispatches by lane", () => {
    expect(profileGate(packOf(5))).toEqual({ ok: false, reason: "skipped: thin (n<6)", n: 5 });
    expect(profileGate(packOf(6))).toEqual({ ok: true, reason: null, n: 6 });
    expect(THIN_SKIP).toBe("skipped: thin (n<6)");
    expect(preDraftGate("companies", packOf(5)).ok).toBe(false);
    expect(preDraftGate("institutions", packOf(6)).ok).toBe(true);
    expect(preDraftGate("theaters", packOf(0))).toEqual({ ok: true, reason: null });
  });
});

describe("gates.mjs — ranking", () => {
  it("companies: mentions_30d desc, artifact_count desc, title; missing from the rollup after ranked ones (by artifact_count); never id", () => {
    const rows = [
      { id: "1", title: "Zed", company_id: "z" },
      { id: "2", title: "Yak", company_id: "y" },
      { id: "3", title: "Xen", company_id: "x" },
      { id: "4", title: "Wex", company_id: "w" },
      { id: "5", title: "Vim", company_id: "v" },
      { id: "6", title: "Ash", company_id: "a" },
    ];
    const rollup = new Map<string, any>([
      ["v", { mentions_30d: 1, artifact_count: 0 }],
      ["w", { mentions_30d: 9, artifact_count: 2 }],
      ["x", { mentions_30d: 9, artifact_count: 7 }],
      ["y", { mentions_30d: null, artifact_count: 40 }], // in the table but unranked ⇒ after the ranked ones
    ]); // z and a: missing
    expect(rankCompanies(rows, rollup).map((r: any) => r.title)).toEqual(["Xen", "Wex", "Vim", "Yak", "Ash", "Zed"]);
  });

  it("institutions: one grouped count over all institution Profiles, count desc", () => {
    const briefs = profileBriefs("institutions", ["alpha", "bravo", "charlie"]);
    const institutions = new Map([["inst_alpha", "cmp_A"], ["inst_bravo", "cmp_B"], ["inst_charlie", "cmp_C"]]);
    const raw = (uid: string, i: number, o: Record<string, unknown> = {}) => ({
      id: `${uid}-${i}`, fired_at: "2026-10-01T00:00:00Z", event_date: "2026-10-01", framing: `Record ${uid} number ${i} reports a material grid event.`, faradays_take: null,
      company_tags: [uid], source_url: `https://www.utilitydive.com/news/${uid}-${i}`, artifact_id: null,
      artifact: { title: `Headline ${uid} ${i}`, source_name: "Utility Dive", summary: null, published_at: "2026-10-01", license_status: null, source_url: `https://www.utilitydive.com/news/${uid}-${i}` }, ...o,
    });
    const signals = [
      ...Array.from({ length: 2 }, (_, i) => raw("cmp_A", i)),
      ...Array.from({ length: 9 }, (_, i) => raw("cmp_B", i)),
      ...Array.from({ length: 4 }, (_, i) => raw("cmp_C", i)),
      raw("cmp_C", 99, { source_url: null, artifact: null }), // no source_url ⇒ not counted
    ];
    const counts = groupedInstitutionCounts(briefs, institutions, signals, NOW());
    expect([...counts.entries()].map(([id, n]) => [briefs.find((b) => b.id === id)!.key, n])).toEqual([["alpha", 2], ["bravo", 9], ["charlie", 4]]);
    expect(rankInstitutions(briefs, counts).map((b: any) => b.key)).toEqual(["bravo", "charlie", "alpha"]);
  });
});

describe("runLane — Profile lanes", () => {
  const keys = ["dense", "mid", "six", "five", "zero"];
  const counts = { dense: 30, mid: 12, six: 6, five: 5, zero: 0 };

  it("draws in rank order (not id); 5 is skipped with no draft or review row and 'skipped: thin (n<6)'; 6 is staged", async () => {
    const briefs = profileBriefs("companies", ["five", "dense", "six", "zero", "mid"]);
    const rollup = [
      { company_uid: "cmp_five", mentions_30d: 50 }, // hottest by rollup, but thin
      { company_uid: "cmp_dense", mentions_30d: 40 },
      { company_uid: "cmp_six", mentions_30d: 30 },
      { company_uid: "cmp_zero", mentions_30d: 20 },
      { company_uid: "cmp_mid", mentions_30d: 10 },
    ];
    const h = harness({ briefs, counts, quota: 3, rollup });
    const s = await h.run({ width: 1 });
    expect(h.fetched).toEqual(["five", "dense", "six", "zero", "mid"]);
    expect(h.drafted).toEqual(["dense", "six", "mid"]);
    expect(s.drafted).toBe(3);
    expect(h.db.writes.versions.map((v: any) => v.briefing_id)).not.toContain(briefs[0].id);
    expect(h.db.writes.reviews).toHaveLength(0);
    expect(s.skipped_briefs).toBe(2);
    expect(s.skips.map((k: any) => [k.title, k.reason, k.n])).toEqual([["Five Corp", "skipped: thin (n<6)", 5], ["Zero Corp", "skipped: thin (n<6)", 0]]);
    expect(s.skips[0].line).toMatch(/· companies · "Five Corp" · skipped: thin \(n<6\) · 5 sourced Signals$/);
    expect(h.out.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("skipped: thin (n<6)"))).toHaveLength(2);
    expect(s.measured.map((m: any) => [m.title, m.n, m.ok])).toEqual([["Five Corp", 5, false], ["Dense Corp", 30, true], ["Six Corp", 6, true], ["Zero Corp", 0, false], ["Mid Corp", 12, true]]);
    expect(h.db.writes.health[0].notes).toMatch(/skipped_thin=2 packs=5/);
  });

  it("quota counts staged drafts only and stops once it is met", async () => {
    const briefs = profileBriefs("companies", keys);
    const h = harness({ briefs, counts, quota: 2, rollup: rollupFor(briefs) });
    const s = await h.run({ width: 3 });
    expect(h.drafted).toEqual(["dense", "mid"]);
    expect(h.fetched).toEqual(["dense", "mid"]); // windows are capped at the drafts still owed
    expect(s.drafted).toBe(2);
  });

  it("keeps drawing until 10 × quota evidence packs have been fetched", async () => {
    const many = profileBriefs("companies", Array.from({ length: 14 }, (_, i) => `thin${String(i).padStart(2, "0")}`));
    const h = harness({ briefs: many, counts: {}, quota: 1, rollup: rollupFor(many) });
    const s = await h.run({ width: 4 });
    expect(FETCH_FACTOR).toBe(10);
    expect(s.fetch_budget).toBe(10);
    expect(s.fetched).toBe(10);
    expect(h.fetched).toHaveLength(10);
    expect(s.drafted).toBe(0);
    expect(s.skipped_briefs).toBe(10);
    expect(h.out.mock.calls.some((c) => /evidence-pack budget \(10\) spent with 0\/1 staged/.test(String(c[0])))).toBe(true);
  });

  it("cursor.skipped = [{ id, n, checked_at }], merged into the stored cursor; requeue and other keys survive", async () => {
    const briefs = profileBriefs("companies", keys);
    const requeue = [{ briefing_id: "elsewhere-0000", version: 2, next_version: 3, gate: "G2-PANEL", blockers: [], required_edits: [], parked: false, requeued_at: "2026-11-12T10:00:00Z" }];
    const h = harness({ briefs, counts, quota: 4, rollup: rollupFor(briefs), cursor: { requeue, last_id: "legacy-keyset", custom: { keep: true } } }); // quota 4 > 3 that clear ⇒ the thin tail is drawn
    await h.run();
    const c = await h.stored();
    expect(c.requeue).toEqual(requeue);
    expect(c.custom).toEqual({ keep: true });
    expect(c.last_id).toBe("legacy-keyset");
    expect(c.skipped.map((e: any) => [e.id, e.n])).toEqual([[briefs[3].id, 5], [briefs[4].id, 0]]);
    expect(c.skipped.every((e: any) => e.checked_at === NOW().toISOString())).toBe(true);
    for (const w of h.db.writes.cursors) expect((w as any).cursor.requeue).toEqual(requeue);
  });

  it("a skipped entry is not re-checked within 7 days, and is re-checked after", async () => {
    const briefs = profileBriefs("companies", keys);
    const skipped = [
      { id: briefs[3].id, n: 5, checked_at: iso(3 * DAY) }, // fresh ⇒ not fetched
      { id: briefs[4].id, n: 0, checked_at: iso(8 * DAY) }, // stale ⇒ re-checked
    ];
    expect(SKIP_RECHECK_DAYS).toBe(7);
    expect(freshSkipped(skipped, NOW()).map((e: any) => e.id)).toEqual([briefs[3].id]);
    const h = harness({ briefs, counts: { ...counts, zero: 7 }, quota: 5, rollup: rollupFor(briefs), cursor: { skipped } });
    const s = await h.run();
    expect(h.fetched).not.toContain("five");
    expect(h.fetched).toContain("zero");
    expect(h.drafted).toContain("zero"); // now clears the floor (7)
    expect(s.recently_skipped).toBe(1);
    const c = await h.stored();
    expect(c.skipped.map((e: any) => e.id)).toEqual([briefs[3].id]); // stale entry dropped once it cleared
    expect(c.skipped[0].checked_at).toBe(skipped[0].checked_at);
  });

  it("a requeue entry for a thin Profile resolves to 'skipped: thin (n<6)' in the summary and is not deleted", async () => {
    const briefs = profileBriefs("companies", keys);
    const requeue = [
      { briefing_id: briefs[3].id, version: 2, next_version: 3, gate: "G1-AUTO", blockers: [{ code: "thin" }], parked: false }, // five: thin
      { briefing_id: briefs[0].id, version: 2, next_version: 3, gate: "G2-PANEL", blockers: [], parked: false }, // dense: clears
    ];
    const h = harness({ briefs, counts, quota: 1, rollup: rollupFor(briefs), cursor: { requeue } });
    const s = await h.run();
    const k = s.skips.find((x: any) => x.briefing_id === briefs[3].id);
    expect(k).toMatchObject({ reason: "skipped: thin (n<6)", n: 5, requeue: true });
    expect(k.line).toMatch(/skipped: thin \(n<6\) · 5 sourced Signals · requeue entry kept$/);
    expect(s.requeue_pending).toEqual([briefs[0].id]);
    expect(h.drafted).not.toContain("dense"); // a requeued draft is left to the redraft path
    expect(h.drafted).toEqual(["mid"]);
    const c = await h.stored();
    expect(c.requeue).toEqual(requeue);

    // Next run within 7 days: resolved from cursor.skipped without fetching the pack again.
    h.fetched.length = 0;
    const s2 = await h.run();
    expect(h.fetched).not.toContain("five");
    expect(s2.skips.find((x: any) => x.briefing_id === briefs[3].id)).toMatchObject({ reason: "skipped: thin (n<6)", n: 5, requeue: true });
    expect((await h.stored()).requeue).toEqual(requeue);
  });

  it("--dry-run writes nothing: no cursor write, no briefings_versions row, no review or health row", async () => {
    const briefs = profileBriefs("companies", keys);
    const h = harness({ briefs, counts, quota: 4, rollup: rollupFor(briefs), cursor: { requeue: [] } });
    const s = await h.run({ dryRun: true });
    expect(s.drafted).toBe(3);
    expect(s.skipped_briefs).toBe(2);
    expect(h.db.writes.versions).toHaveLength(0);
    expect(h.db.writes.cursors).toHaveLength(0);
    expect(h.db.writes.reviews).toHaveLength(0);
    expect(h.db.writes.health).toHaveLength(0);
    expect(await h.stored()).toEqual({ requeue: [] });
  });

  it("briefs whose next draft is already staged are not drawn again", async () => {
    const briefs = profileBriefs("companies", keys);
    const h = harness({ briefs, counts, quota: 1, rollup: rollupFor(briefs), versions: [{ briefing_id: briefs[0].id, version: 2, kind: "draft" }] });
    const s = await h.run();
    expect(s.already_staged).toBe(1);
    expect(h.fetched[0]).toBe("mid");
    expect(h.drafted).toEqual(["mid"]);
    const s2 = await h.run();
    expect(s2.already_staged).toBe(2); // this run's own draft is excluded too
    expect(h.drafted).toEqual(["mid", "six"]);
  });

  it("institutions lane drafts in grouped-count order", async () => {
    const briefs = profileBriefs("institutions", ["alpha", "bravo", "charlie"]);
    const raw = (uid: string, i: number) => ({
      id: `${uid}-${i}`, fired_at: "2026-10-01T00:00:00Z", event_date: "2026-10-01", framing: `Record ${uid} number ${i} reports a material grid event.`, faradays_take: null,
      company_tags: [uid], source_url: `https://www.rtoinsider.com/${uid}-${i}`, artifact_id: null,
      artifact: { title: `Headline ${uid} ${i}`, source_name: "RTO Insider", summary: null, published_at: "2026-10-01", license_status: null, source_url: `https://www.rtoinsider.com/${uid}-${i}` },
    });
    const h = harness({
      lane: "institutions", briefs, quota: 1, counts: { alpha: 8, bravo: 3, charlie: 9 },
      institutions: [{ institution_uid: "inst_alpha", company_uid: "cA" }, { institution_uid: "inst_bravo", company_uid: "cB" }, { institution_uid: "inst_charlie", company_uid: "cC" }],
      institutionSignals: [...Array.from({ length: 7 }, (_, i) => raw("cA", i)), ...Array.from({ length: 2 }, (_, i) => raw("cB", i)), ...Array.from({ length: 11 }, (_, i) => raw("cC", i))],
    });
    const s = await h.run();
    expect(h.fetched).toEqual(["charlie"]);
    expect(h.drafted).toEqual(["charlie"]);
    expect(s.found).toBe(3);
  });

  it("census measures every eligible Profile, lists who clears the floor and writes nothing", async () => {
    const briefs = profileBriefs("companies", keys);
    const h = harness({ briefs, counts, quota: 1, rollup: rollupFor(briefs) });
    const s = await h.run({ census: true });
    expect(h.drafted).toEqual([]);
    expect(h.fetched.sort()).toEqual([...keys].sort()); // not capped at 10 × quota
    expect(s.clears_floor).toBe(3);
    expect(s.measured.filter((m: any) => m.ok).map((m: any) => m.title)).toEqual(["Dense Corp", "Mid Corp", "Six Corp"]);
    expect(h.db.writes.cursors).toHaveLength(0);
    expect(h.db.writes.health).toHaveLength(0);
    expect(h.out.mock.calls.some((c) => /3 of 5 measured Profiles clear the 6-Signal floor/.test(String(c[0])))).toBe(true);
    expect(parseArgs(["--lane", "institutions", "--census"])).toMatchObject({ census: true, dryRun: true });
    expect(() => parseArgs(["--lane", "theaters", "--census"])).toThrow(/companies and institutions/);
  });

  it("legacy lanes: the id keyset is unchanged and a cursor write merges (requeue survives)", async () => {
    const fx = loadFixtures();
    const lanes = fx.lanes.map((l: any) => (l.lane === "theaters" ? { ...l, cursor: { requeue: [{ briefing_id: "x", version: 2 }] } } : l));
    const db = createFixtureDb({ ...fx, lanes });
    const statuslog = createStatusLog({ token: undefined, now: NOW, out: () => {} });
    const s = await runLane({ lane: "theaters", quota: 1, db, statuslog, now: NOW, out: () => {}, generate: fakeGenerate() } as any);
    expect(s.cursor_out.last_id).toBe("fx000100-0001-4000-8000-000000000001");
    expect((await db.getLane("theaters")).cursor).toMatchObject({ last_id: "fx000100-0001-4000-8000-000000000001", requeue: [{ briefing_id: "x", version: 2 }] });
  });
});

describe("evidence probe and wiring", () => {
  it("fetchPack hands the same raw pack to the next generate(); the fixture Profiles clear the floor", async () => {
    const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
    let fetches = 0;
    const probe = createEvidenceProbe({ kind: "fixture", fetchRaw: async (b: any) => (fetches++, evidence.fetchRaw(b)) });
    const fx = loadFixtures();
    const coreweave = fx.briefings.find((b: any) => b.title === "CoreWeave");
    const ercot = fx.briefings.find((b: any) => b.title === "Electric Reliability Council of Texas");
    const cw = profileGate(await probe.fetchPack(coreweave, { now: NOW() }));
    const er = profileGate(await probe.fetchPack(ercot, { now: NOW() }));
    expect(cw.ok && er.ok).toBe(true);
    expect(fetches).toBe(2);
    const g = await generate(coreweave, { evidence: probe.evidence, now: NOW() });
    expect(fetches).toBe(2);
    expect(probe.held()).toBe(1);
    expect(g.thin).toBe(false);
  });

  it("run-all passes generator.generate, which carries the probe, so the Profile lanes are gated end to end", async () => {
    const fx = loadFixtures();
    const db = createFixtureDb(fx);
    const generator = await buildGenerator({ evidenceDir: EVIDENCE_FIXTURES_DIR, render: false, llm: false, out: () => {} });
    try {
      expect(typeof (generator.generate as any).fetchPack).toBe("function");
      const [companies, institutions] = (await runAll({ lanes: ["companies", "institutions"], db, statuslogFactory: () => createStatusLog({ token: undefined, now: NOW, out: () => {} }), generator, quota: undefined, dryRun: true, width: 2, now: NOW, out: () => {} })) as any[];
      expect(companies.gated).toBe(true);
      expect(companies.measured[0]).toMatchObject({ title: "CoreWeave", ok: true });
      expect(companies.measured[0].n).toBeGreaterThanOrEqual(6);
      expect(companies.drafted).toBe(1);
      expect(institutions.measured[0]).toMatchObject({ title: "Electric Reliability Council of Texas", ok: true });
      expect(institutions.drafted).toBe(1);
      expect(db.writes.versions).toHaveLength(0);
    } finally {
      await closeGenerator(generator);
    }
  });
});
