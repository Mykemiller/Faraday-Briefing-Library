// BL3-09 (FDY-332): G3 decision (a) and the Thread gates.
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStatusLog } from "../../scripts/statuslog.mjs";
import { xcheckVerdict, importName } from "../../scripts/review/panel.mjs";
import { runChain, createFixtureDb as createReviewDb, loadFixtures as loadReviewFixtures } from "../../scripts/review/run.mjs";
import { THREAD_MIN_PAGES, THREAD_MIN_SOURCED_ITEMS, gateSkipSentence, postDraftGate, preDraftGate, sourcedItemCount, threadGate, threadShortGate } from "../../scripts/lanes/gates.mjs";
import { EVIDENCE_FIXTURES_DIR, buildGenerator, createFixtureDb, loadFixtures, runLane } from "../../scripts/lanes/run.mjs";
import { buildPack, createFixtureEvidence, evidenceWindow } from "../../scripts/lanes/evidence.mjs";

const NOW = () => new Date("2026-11-09T15:04:00Z");
const S = "ERCOT is tracking more than 438,000 MW of large-load requests [S1].";
const T = "Vertiv agreed to pay about $1.45 billion for a microgrid specialist [S2].";
const mismatch = (sentence: string) => ({ sentence, claim: "c", cited: ["S1"], source_excerpt: "e", verdict: "mismatch" });
const violation = (sentence: string) => ({ sentence_or_section: sentence, rule: "r", note: "" });
const facts = (findings: any[] = [], cleared: string[] = []) => ({ findings, cleared, numbers_checked: 3, summary: "" });
const voice = (violations: any[] = [], cleared: string[] = []) => ({ violations, cleared, summary: "" });

describe("G3 decision (a): one verdict per dimension, parking only on a same-dimension repeat", () => {
  it("attempt 1 never parks: FAIL if either dimension fails, PASS if both pass", () => {
    expect(xcheckVerdict(facts([], [S]), voice([], [S])).verdict).toBe("PASS");
    expect(xcheckVerdict(facts([mismatch(S)]), voice()).verdict).toBe("FAIL");
    expect(xcheckVerdict(facts(), voice([violation(S)])).verdict).toBe("FAIL");
    // a voice violation on a sentence facts cleared is a voice FAIL, reported, not PARKED
    const cross = xcheckVerdict(facts([], [S]), voice([violation(S)]));
    expect(cross).toMatchObject({ verdict: "FAIL", a: "PASS", b: "FAIL", attempt: 1, repeats: [] });
    expect(cross.cross_dimension).toEqual([{ sentence: S, facts: "cleared", voice: "violation" }]);
    // the reverse direction too: facts mismatch on a sentence voice cleared
    expect(xcheckVerdict(facts([mismatch(S)]), voice([], [S]))).toMatchObject({ verdict: "FAIL", a: "FAIL", b: "PASS" });
  });

  it("attempt 2: the same dimension failing on the same sentence parks", () => {
    const priorFacts = [{ code: "fact_mismatch", sentence: "ERCOT is tracking more than 438,000 MW of large-load requests." }]; // markers/punctuation normalised away
    const f = xcheckVerdict(facts([mismatch(S)]), voice(), { priorBlockers: priorFacts });
    expect(f).toMatchObject({ verdict: "PARKED", attempt: 2, repeats: [{ dimension: "facts", sentence: S }] });
    expect(f.blockers.map((b: any) => b.code)).toEqual(["fact_mismatch", "repeat_same_dimension"]);
    const v = xcheckVerdict(facts(), voice([violation(T)]), { priorBlockers: [{ code: "voice_violation", sentence: T }] });
    expect(v).toMatchObject({ verdict: "PARKED", repeats: [{ dimension: "voice", sentence: T }] });
  });

  it("attempt 2: anything else is judged as attempt 1", () => {
    // other dimension on the same sentence
    expect(xcheckVerdict(facts([mismatch(S)]), voice(), { priorBlockers: [{ code: "voice_violation", sentence: S }] }).verdict).toBe("FAIL");
    // same dimension, different sentence
    expect(xcheckVerdict(facts([mismatch(T)]), voice(), { priorBlockers: [{ code: "fact_mismatch", sentence: S }] }).verdict).toBe("FAIL");
    // the earlier failure fixed
    expect(xcheckVerdict(facts([], [S]), voice(), { priorBlockers: [{ code: "fact_mismatch", sentence: S }] }).verdict).toBe("PASS");
    // a superseded BL2-06 'disagreement' blocker on the prior row is not a dimension failure
    expect(xcheckVerdict(facts(), voice([violation(S)]), { priorBlockers: [{ code: "disagreement", sentence: S }] }).verdict).toBe("FAIL");
  });

  it("the chain: a second G3 FAIL with no repeat goes back to the lane; a repeat parks (prior row read from briefing_reviews)", async () => {
    const fx = loadReviewFixtures();
    const draft = fx.drafts.find((d: any) => d.job === "lane-subdomains");
    const dir = mkdtempSync(join(tmpdir(), "bl3-09-g3-"));
    writeFileSync(join(dir, importName(draft, "xcheck-facts")), JSON.stringify(facts([mismatch(S)])));
    writeFileSync(join(dir, importName(draft, "xcheck-voice")), JSON.stringify(voice([violation(T)])));
    const priorRow = (blockers: any) => ({ id: "rev-prior", briefing_id: draft.briefing_id, version: draft.version - 1, gate: "G3-XCHECK", reviewer: "xcheck-facts+xcheck-voice", result: "FAIL", created_at: "2026-11-08T00:00:00Z", blockers, notes: "{}" });
    const run = async (prior: any) => {
      const db = createReviewDb({ ...fx, reviews: [...fx.reviews, prior] });
      const statuslog = createStatusLog({ token: undefined, now: NOW, out: vi.fn() });
      const s: any = await runChain({ gate: "G3-XCHECK", lane: "subdomains", dryRun: true, allGates: true, panel: "import", importDir: dir, db, statuslog, now: NOW, out: vi.fn() } as any);
      return { s, row: s.rows[0], notes: JSON.parse(s.rows[0].notes) };
    };
    // prior attempt failed on a different sentence in the same dimension ⇒ FAIL, not "second consecutive FAIL ⇒ PARKED"
    const a = await run(priorRow([{ code: "fact_mismatch", sentence: T }]));
    expect(a.s).toMatchObject({ reviewed: 1, failed: 1, parked: 0 });
    expect(a.notes).toMatchObject({ attempt: 2, repeats: [], prior_version: draft.version - 1 });
    expect(a.s.lines.some((l: string) => /G3-XCHECK · FAIL · Cross-check failed/.test(l))).toBe(true);
    // prior attempt failed on the same sentence in the same dimension (blockers stored as a JSON string) ⇒ PARKED
    const b = await run(priorRow(JSON.stringify([{ code: "fact_mismatch", sentence: S }])));
    expect(b.s).toMatchObject({ reviewed: 1, failed: 0, parked: 1 });
    expect(b.notes.parked).toBe(true);
    expect(b.s.lines.some((l: string) => /G3-XCHECK · PARKED · Same dimension failed again on 1 sentence/.test(l))).toBe(true);
  });

  it("SYNTHETIC fixture of the 9 would-park cases (BL2-08 status log, 2026-11-11): 9 under the superseded rule, 0 now", () => {
    // SYNTHETIC: the pilot's G3 ran as a dry run and kept no reviewer JSON or briefing_reviews rows. These are
    // built from the nine PARKED status-log lines (sentence prefixes as logged), modelled as the facts reviewer
    // clearing a sentence the voice reviewer flagged. This is not a pilot replay.
    const synthetic: Record<string, string[]> = {
      "0a796c52": ["Bloom Energy secured two major data center power deals on November 5, 2026: a 90"],
      "0f7921e2": ["The post Inside Climate News: Texas Electric Utility Only Considered Gas to Pow"],
      "1812b4c3": ["What to watch: Nevada Regulators Approve Switch's 510-Megawatt Gas Plant for"],
      "1e686fe1": ["Polar DC Group Limited secured over €1B in 2026 funding from H.I.G. Capital, LIA", "Germany's Energy Efficiency Act mandates data centers with ≥300 kW IT capacity m"],
      "262e7f05": ["Poland and Finland are highlighted as emerging European markets with hyperscale"],
      "2bec3c9b": ["Around 150–200 protesters were arrested in Amsterdam on November 7, 2026 after b", "Successful proof-of-concept chiller delivers over 3.5 MW of cooling capacity whi", "TL;DR: One design isn't enough to deliver data centres across Europe, because lo"],
      "31e8dbcf": ["Virginia implemented a $0.011/kWh statewide electricity consumption tax on data"],
      "3c873bf0": ["Aug. 31, 2026 Twelve Percent Beer Project, North Haven"],
      "75b4756b": ["Elon Musk's Terafab targets 1 million wafers per month by 2032", "TSMC approved $40.93 billion in capital expenditures for 2027", "CoreWeave reported Q3 2026 revenue of $3.661 billion", "Anthropic has launched its"],
    };
    const cases = Object.entries(synthetic).map(([id, sentences]) => ({ id, v: xcheckVerdict(facts([], sentences), voice(sentences.map(violation))) }));
    expect(cases).toHaveLength(9);
    const supersededRuleWouldPark = cases.filter(({ v }) => v.cross_dimension.length > 0).length; // BL2-06: facts-cleared vs voice-flagged ⇒ PARKED
    const parkedNow = cases.filter(({ v }) => v.verdict === "PARKED").length;
    expect(supersededRuleWouldPark).toBe(9);
    expect(parkedNow).toBe(0);
    for (const { v } of cases) expect(v).toMatchObject({ verdict: "FAIL", a: "PASS", b: "FAIL" });
  });

  it("stored BL2-05 sample outcomes (reviews.sample.json, real rows): the 2 the superseded rule parked now FAIL on voice", () => {
    const rows = JSON.parse(readFileSync(join(__dirname, "../../scripts/review/fixtures/reviews.sample.json"), "utf8")).filter((r: any) => r.gate === "G3-XCHECK");
    expect(rows).toHaveLength(7);
    let before = 0;
    let after = 0;
    for (const row of rows) {
      const n = JSON.parse(row.notes);
      if (n.parked) before += 1;
      const cleared = (n.disagreements ?? []).filter((d: any) => d.a === "cleared").map((d: any) => d.sentence);
      const f = facts(row.blockers.filter((b: any) => b.code === "fact_mismatch").map((b: any) => ({ sentence: b.sentence, claim: b.message, cited: b.cited, source_excerpt: b.source_excerpt, verdict: "mismatch" })), cleared);
      const v = xcheckVerdict(f, voice(row.blockers.filter((b: any) => b.code === "voice_violation").map((b: any) => ({ sentence_or_section: b.sentence, rule: b.rule, note: b.note }))));
      if (v.verdict === "PARKED") after += 1;
      expect(v).toMatchObject({ verdict: "FAIL", a: n.a, b: n.b, mismatches: n.mismatches, violations: n.violations });
    }
    expect(before).toBe(2);
    expect(after).toBe(0);
  });
});

describe("Thread gates (gates.mjs)", () => {
  const pack = (n: number) => ({ items: Array.from({ length: n }, (_, i) => ({ url: `https://x/${i}` })) });

  it("threadGate: 12 sourced items or more, else thread_thin; items without a URL do not count", () => {
    expect(THREAD_MIN_SOURCED_ITEMS).toBe(12);
    expect(threadGate(pack(12))).toEqual({ ok: true, reason: null, n: 12 });
    expect(threadGate(pack(11))).toEqual({ ok: false, reason: "thread_thin", n: 11 });
    expect(sourcedItemCount({ items: [{ url: "https://a" }, { url: "" }, {}] })).toBe(1);
    expect(threadGate(null)).toEqual({ ok: false, reason: "thread_thin", n: 0 });
  });

  it("preDraftGate dispatches by lane; Thread gate is Standard-only", () => {
    expect(preDraftGate("subdomains", pack(6))).toEqual({ ok: false, reason: "thread_thin", n: 6 });
    expect(preDraftGate("subdomains", pack(6), { tier: "standard" }).ok).toBe(false);
    expect(preDraftGate("subdomains", pack(6), { tier: "deep" })).toEqual({ ok: true, reason: null });
    for (const lane of ["theaters", "domains", "states", "countries"]) expect(preDraftGate(lane, pack(0))).toEqual({ ok: true, reason: null }); // companies/institutions: FDY-329's profileGate
  });

  it("postDraftGate: a Standard Thread rendering under 8 pp is thread_short; unmeasured passes", () => {
    expect(THREAD_MIN_PAGES).toBe(8);
    expect(postDraftGate("subdomains", { render_checked: true, pages: 7 }, { tier: "standard" })).toEqual({ ok: false, reason: "thread_short", pages: 7 });
    expect(postDraftGate("subdomains", { render_checked: true, pages: 8 }, { tier: "standard" })).toEqual({ ok: true, reason: null, pages: 8 });
    expect(threadShortGate({ render_checked: false, pages: null })).toEqual({ ok: true, reason: null });
    expect(postDraftGate("subdomains", { render_checked: true, pages: 6 }, { tier: "deep" }).ok).toBe(true);
    expect(postDraftGate("domains", { render_checked: true, pages: 3 }).ok).toBe(true);
  });

  it("skip sentences", () => {
    expect(gateSkipSentence({ ok: false, reason: "thread_thin", n: 6 })).toBe("Skipped (thread_thin): 6 sourced evidence items (< 12); no draft staged.");
    expect(gateSkipSentence({ ok: false, reason: "thread_short", pages: 6 })).toBe("Skipped (thread_short): rendered 6 pp (< 8); no draft staged.");
  });
});

describe("lane runner with the Thread gates", () => {
  const fixtures = loadFixtures();
  const thread = fixtures.briefings.find((b: any) => b.briefing_type === "thread");
  const harness = (lanes = fixtures.lanes) => {
    const db = createFixtureDb({ ...fixtures, lanes });
    const out = vi.fn();
    const statuslog = createStatusLog({ token: undefined, now: NOW, out });
    return { db, out, statuslog, run: (o: Record<string, unknown>) => runLane({ lane: "subdomains", db, statuslog, now: NOW, out, ...o } as any) };
  };

  it("a gated brief stages nothing, writes no review row, logs the reason, advances the cursor, and resolves its requeue entry", async () => {
    const requeue = [{ briefing_id: thread.id, version: 3, next_version: 4, gate: "G2-PANEL", blockers: [], parked: false }];
    const lanes = fixtures.lanes.map((l: any) => (l.lane === "subdomains" ? { ...l, cursor: { requeue } } : l));
    const thinPack = { items: Array.from({ length: 6 }, (_, i) => ({ url: `https://x/${i}` })) };
    const fullPack = { items: Array.from({ length: 12 }, (_, i) => ({ url: `https://x/${i}` })) };
    const gen = (pages: number) => async (brief: any) => ({ title: brief.title, contents: [], source_refs: [], manuscript_md: "x", pages, page_range: [8, 10], in_range: pages >= 8, render_checked: true, thin: false, source_count: 1 });
    const cases = [
      // pre-draft (FDY-329's probe + gate path): 6 sourced items
      { o: { fetchPack: async () => thinPack, generate: vi.fn(gen(9)) }, v: { reason: "thread_thin", n: 6 }, line: /· fx000500 · subdomains · standard · DRAFTED · FAIL · Skipped \(thread_thin\): 6 sourced evidence items \(< 12\); no draft staged\.$/, skipLine: /thread_thin · 6 sourced items · requeue entry kept$/ },
      // post-render: enough evidence, but the composed Thread measures 6 pp
      { o: { fetchPack: async () => fullPack, generate: vi.fn(gen(6)) }, v: { reason: "thread_short", pages: 6 }, line: /DRAFTED · FAIL · Skipped \(thread_short\): rendered 6 pp \(< 8\); no draft staged\.$/, skipLine: /thread_short · rendered 6 pp · requeue entry kept$/ },
    ];
    for (const c of cases) {
      const { db, run } = harness(lanes);
      const s = await run(c.o);
      expect(s).toMatchObject({ found: 1, drafted: 0, failed: 0, errors: [], skipped_briefs: 1, gated: true });
      if (c.v.reason === "thread_thin") expect(c.o.generate).not.toHaveBeenCalled();
      expect(db.writes.versions).toHaveLength(0);
      expect(db.writes.reviews).toHaveLength(0);
      expect(s.skips).toHaveLength(1);
      expect(s.skips[0]).toMatchObject({ briefing_id: thread.id, title: thread.title, requeue: true, ...c.v });
      expect(s.skips[0].line).toMatch(c.skipLine);
      expect(s.requeue_resolved).toEqual([{ briefing_id: thread.id, version: 3, gate: "G2-PANEL", resolution: `skipped: ${c.v.reason}` }]);
      expect(s.lines).toHaveLength(1);
      expect(s.lines[0]).toMatch(c.line);
      expect(s.cursor_out.last_id).toBe(thread.id);
      expect(db.writes.health[0].success).toBe(true);
    }
  });

  it("buildGenerator runs preDraftGate on the real pack: 111 sourced items drafts; the same pack cut to 11 is skipped, to 12 is drafted", async () => {
    const real = JSON.parse(readFileSync(join(EVIDENCE_FIXTURES_DIR, `${thread.id}.json`), "utf8"));
    const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
    const raw = await evidence.fetchRaw(thread);
    expect(sourcedItemCount(buildPack(raw, thread, evidenceWindow(thread, new Date(raw.captured_at))))).toBe(111);
    const withSignals = (n: number) => {
      const dir = mkdtempSync(join(tmpdir(), "bl3-09-ev-"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${thread.id}.json`), JSON.stringify({ ...real, signals: real.signals.slice(0, n) }));
      return dir;
    };
    for (const [dir, drafted] of [[EVIDENCE_FIXTURES_DIR, 1], [withSignals(12), 1], [withSignals(11), 0]] as const) {
      const g = await buildGenerator({ evidenceDir: dir as any, render: false, llm: false, out: () => {} });
      try {
        const { db, run } = harness();
        const s = await run({ generate: g.generate });
        expect(s.drafted).toBe(drafted);
        expect(db.writes.versions).toHaveLength(drafted);
        if (!drafted) expect(s.skips[0]).toMatchObject({ reason: "thread_thin", n: 11 });
      } finally {
        await g.close();
      }
    }
  });
});
