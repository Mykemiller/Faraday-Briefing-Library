// BL3-08a (FDY-333a): the deterministic half of "thesis first, forward watch list, jurisdiction filter" —
// jurisdiction filter, omitted empty headings, posture staleness, forward-dated watch list, entry budget.
// No model, no key, no network. Pack cases are SYNTHETIC items on top of the real fx000800/fx000900 packs;
// the five FDY-306 pilot state fixtures are not all in the repo.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildPack, createFixtureEvidence, evidenceWindow } from "../../scripts/lanes/evidence.mjs";
import { applyEntryBudget, compose, forwardEnd, forwardMentions, NO_TRIGGERS, watchList } from "../../scripts/lanes/compose.mjs";
import { classifyJurisdictionItem, filterJurisdictionItems, postureStale, subjectOf, RECONCILIATION_SENTENCE } from "../../scripts/lanes/jurisdiction.mjs";
import { checkWatchEmpty, parseManuscript, runG1 } from "../../scripts/review/g1.mjs";
import { EVIDENCE_FIXTURES_DIR, FIXTURES_DIR } from "../../scripts/lanes/run.mjs";

const quiet = { log: null };
const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
const NOW = new Date("2026-11-11T12:00:00Z");

const item = (over: any = {}) => ({ ref_kind: "signal", id: over.id ?? "x", headline: "h", text: ["t."], date: "2026-11-01", domain_tags: [], subdomain_tags: [], ...over });
const CA = subjectOf({ name: "California", level: "state", state_abbr: "CA" });
const DE = subjectOf({ name: "Germany", level: "country", country_code: "DE" });
const TN = subjectOf({ name: "Tennessee", level: "state", state_abbr: "TN", iso_rto: "PJM" });

describe("jurisdiction filter (synthetic items)", () => {
  it("keeps items that name the jurisdiction, drops Singapore and an unrelated PJM rule", () => {
    expect(classifyJurisdictionItem(item({ headline: "California signs SB 57 on data center tariffs" }), CA)).toBe("local");
    expect(classifyJurisdictionItem(item({ headline: "Singapore lifts its data center moratorium" }), CA)).toBe("off");
    expect(classifyJurisdictionItem(item({ headline: "PJM capacity auction rules change for large loads" }), TN)).toBe("off");
    expect(classifyJurisdictionItem(item({ headline: "TVA raises large-load rates in Tennessee" }), TN)).toBe("local");
    expect(classifyJurisdictionItem(item({ text: ["Plans for Austin, TX campus"] }), subjectOf({ name: "Texas", level: "state", state_abbr: "TX" }))).toBe("local");
    expect(classifyJurisdictionItem(item({ headline: "ERCOT sets new large-load study rules" }), subjectOf({ name: "Texas", level: "state", state_abbr: "TX" }))).toBe("local");
  });
  it("jurisdiction-fetched kinds are local by construction", () => {
    for (const k of ["jw_event", "moratorium", "puc", "facility", "incentive", "record"]) expect(classifyJurisdictionItem(item({ ref_kind: k, headline: "no place name here" }), CA)).toBe("local");
  });
  it("US states: federal items are context, capped at 2, under 'Federal context'; EU states get 'EU context'", () => {
    const fed = [1, 2, 3].map((i) => item({ id: `f${i}`, headline: `FERC order ${i} on large loads`, date: `2026-11-0${i}` }));
    const r = filterJurisdictionItems([item({ id: "l", headline: "California bill" }), ...fed, item({ id: "o", headline: "Elsewhere" })], CA);
    expect(r.local.map((i: any) => i.id)).toEqual(["l"]);
    expect(r.context.map((i: any) => i.id)).toEqual(["f3", "f2"]);
    expect(r.context_heading).toBe("Federal context");
    expect(r.dropped).toBe(2); // 'Elsewhere' + the third federal item
    const eu = filterJurisdictionItems([item({ headline: "The European Commission opens a consultation" })], DE);
    expect(eu.context_heading).toBe("EU context");
    expect(filterJurisdictionItems([item({ headline: "FERC order" })], DE).context).toEqual([]); // federal is a US-state notion
  });
});

describe("composed jurisdiction briefs (real fixture packs)", () => {
  async function pack(prefix: string, mutate?: (raw: any) => void) {
    const b = briefs.find((x) => x.id.startsWith(prefix));
    const raw = await evidence.fetchRaw(b);
    mutate?.(raw);
    const now = new Date(raw.captured_at);
    return { b, now, pack: buildPack(raw, b, evidenceWindow(b, now), quiet) };
  }
  it("headings are omitted when empty and nothing off-jurisdiction is cited", async () => {
    for (const p of ["fx000800", "fx000900"]) {
      const { b, now, pack: pk } = await pack(p);
      const d = compose(b, pk, { now });
      const heads = d.manuscript_md.match(/^## .*$/gm)!;
      expect(d.manuscript_md).not.toMatch(/The record holds no dated Signal for this heading/);
      // every section that is printed carries at least one entry
      const body = d.manuscript_md.split(/^## /m).slice(1).filter((s: string) => /^(Legislation|Permitting|Power & utility|Incentives|Water|Other recorded|Federal context|EU context)/.test(s));
      for (const s of body) expect(s).toMatch(/\n### /);
      expect(d.meta.jurisdiction_filter).toBeTruthy();
      expect(d.meta.jurisdiction_filter.dropped).toBeGreaterThanOrEqual(d.meta.jurisdiction_filter.by_class.off);
      expect(heads.length).toBeLessThanOrEqual(11);
    }
  });
  it("a Singapore item is dropped from a Texas brief and counted", async () => {
    const { b, now, pack: pk } = await pack("fx000800");
    const stray = { ...pk.items.find((i: any) => i.ref_kind === "signal"), id: "stray", headline: "Singapore lifts data center moratorium", text: ["Singapore lifted its moratorium."], url: "https://wire.example/stray", title: "Singapore lifts", artifact_id: null, subdomain_tags: [], domain_tags: [] };
    const d = compose(b, { ...pk, items: [stray, ...pk.items] }, { now });
    expect(d.manuscript_md).not.toContain("Singapore lifted its moratorium");
    expect(d.meta.jurisdiction_filter.dropped).toBeGreaterThanOrEqual(1);
  });
  it("Texas: posture flagged stale and reconciled in one fixed sentence", async () => {
    const { b, now, pack: pk } = await pack("fx000800");
    const d = compose(b, pk, { now });
    expect(d.meta.posture_stale.stale).toBe(true);
    expect(d.manuscript_md.split(RECONCILIATION_SENTENCE).length - 1).toBe(1);
  });
  it("Germany (neutral posture): not flagged, no reconciliation sentence", async () => {
    const { b, now, pack: pk } = await pack("fx000900");
    const d = compose(b, pk, { now });
    expect(d.meta.posture_stale.stale).toBe(false);
    expect(d.manuscript_md).not.toContain(RECONCILIATION_SENTENCE);
  });
  it("Signals to watch lists only forward-dated rows, none on or before the preparation date", async () => {
    for (const p of ["fx000800", "fx000900"]) {
      const { b, now, pack: pk } = await pack(p);
      const rows = watchList(pk.items, now);
      expect(rows.length).toBeGreaterThan(0);
      const today = now.toISOString().slice(0, 10);
      expect(rows.every((r: any) => r.date > today)).toBe(true);
    }
  });
  it("no JW queue-delta period_end ever reaches the watch list (reporting buckets are not triggers)", async () => {
    const { pack: pk, now } = await pack("fx000800", (raw) => {
      raw.jw.permit_events = raw.jw.permit_events.map((e: any) => ({ ...e, triggered_at: "2026-11-08T00:00:00Z" }));
    });
    const jw = pk.items.filter((i: any) => i.ref_kind === "jw_event");
    expect(jw.length).toBeGreaterThan(0);
    expect(jw.every((i: any) => i.forward_date > "2026-11-09")).toBe(true);
    expect(watchList(pk.items, now).some((r: any) => r.item.ref_kind === "jw_event")).toBe(false);
  });
});

describe("watch list (synthetic)", () => {
  it("resolves phrases to an end date and drops those already past", () => {
    expect(forwardEnd("Q1 2027", NOW)).toBe("2027-03-31");
    expect(forwardEnd("December 15", NOW)).toBe("2026-12-15");
    expect(forwardEnd("Dec 15, 2026", NOW)).toBe("2026-12-15");
    expect(forwardEnd("2028", NOW)).toBe("2028-12-31");
    expect(forwardEnd("2026-12-01", NOW)).toBe("2026-12-01");
    const rows = forwardMentions([item({ text: ["The vote is set for December 15.", "The hearing was held on November 3.", "Commissioning is expected by 2028."] })], NOW);
    expect(rows.map((r: any) => r.date)).toEqual(["2026-12-15", "2028-12-31"]);
  });
  it("fewer than 2 rows prints 'No dated triggers in the record.' and G1 raises watch_empty (warning)", async () => {
    const b = briefs.find((x: any) => x.id.startsWith("fx000900"));
    const raw = await evidence.fetchRaw(b);
    const now = new Date(raw.captured_at);
    const pk = buildPack(raw, b, evidenceWindow(b, now), quiet);
    const bare = { ...pk, items: pk.items.map((i: any) => ({ ...i, text: i.text.map((t: string) => t.replace(/\b20(2[7-9]|3\d)\b/g, "soon")) })) };
    const d = compose(b, bare, { now });
    expect(d.manuscript_md).toContain(NO_TRIGGERS);
    const out: any[] = [];
    checkWatchEmpty(parseManuscript(d.manuscript_md), (code: string, message: string, extra: any = {}) => out.push({ code, ...extra }));
    expect(out).toEqual([{ code: "watch_empty", section: "Signals to watch", severity: "warn" }]);
    const resolve = (u: string) => ({ resolved: true, text: "x", title: "t", published_at: "2026-11-01" });
    const r = runG1({ draft: { ...d, briefing_type: b.briefing_type }, briefing: b, pages: 9, resolve, now });
    expect(r.warnings.map((w: any) => w.code)).toContain("watch_empty");
    expect(r.blockers.map((x: any) => x.code)).not.toContain("watch_empty");
  });
});

describe("posture staleness (synthetic)", () => {
  const jrec = { date: "2026-07-13", tier: "Leading", text: [] as string[] };
  it("flags a favorable posture under newer restrictive items more than 30 days later", () => {
    const r = postureStale(jrec, [item({ date: "2026-11-05", headline: "Lavon adopts data center moratorium" }), item({ date: "2026-11-02", headline: "County pauses permits" })]);
    expect(r.stale).toBe(true);
  });
  it("does not flag within 30 days, a neutral tier, or items that agree", () => {
    expect(postureStale(jrec, [item({ date: "2026-08-01", headline: "City adopts moratorium" })]).stale).toBe(false);
    expect(postureStale({ ...jrec, tier: "Mixed" }, [item({ date: "2026-11-05", headline: "Moratorium" })]).stale).toBe(false);
    expect(postureStale(jrec, [item({ date: "2026-11-05", headline: "State approves incentive package" })]).stale).toBe(false);
  });
});

describe("entry budget", () => {
  it("trims the oldest entry of the fullest section, never below one per section", () => {
    const mk = (n: number, tag: string) => ({ name: tag, items: Array.from({ length: n }, (_, i) => item({ id: `${tag}${i}` })) });
    const out = applyEntryBudget([mk(6, "a"), mk(3, "b"), mk(1, "c")], 7);
    expect(out.reduce((n: number, s: any) => n + s.items.length, 0)).toBe(7);
    expect(out[0].items.map((i: any) => i.id)).toEqual(["a0", "a1", "a2"]);
    expect(applyEntryBudget([mk(1, "a"), mk(1, "b")], 1).map((s: any) => s.items.length)).toEqual([1, 1]);
  });
  it("a composed Standard draft respects its template budget", async () => {
    const b = briefs.find((x: any) => x.id.startsWith("fx000800"));
    const raw = await evidence.fetchRaw(b);
    const now = new Date(raw.captured_at);
    const pk = buildPack(raw, b, evidenceWindow(b, now), quiet);
    const d = compose(b, pk, { now, budget: { maxEntries: 12 } });
    expect(d.meta.sections.reduce((n: number, s: any) => n + s.items, 0)).toBeLessThanOrEqual(12);
  });
});
