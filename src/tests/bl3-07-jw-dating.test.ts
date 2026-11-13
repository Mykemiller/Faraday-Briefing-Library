// BL3-07 (FDY-331): Jurisdiction Watch events are dated by observed_at ?? triggered_at, never period_end;
// hedges, date qualifiers and ranges survive composition; nothing is dated after the preparation date.
//
// The five FDY-306 pilot state fixtures are not all in the repo (only fx000800 and fx000900 carry
// jw.permit_events), and neither carries observed_at/triggered_at. The cases below are therefore built
// on those two real packs with SYNTHETIC permit events, and the qualifier cases are SYNTHETIC sentences
// named after the FDY-306 evidence ("casi €250 million", "up to $600M", "20–30 MW", "by 2032"/"after 2032").
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPack,
  clipSentence,
  createFixtureEvidence,
  evidenceWindow,
  jwEventDate,
  qualifiedFigures,
  verifyQualifiers,
} from "../../scripts/lanes/evidence.mjs";
import { compose } from "../../scripts/lanes/compose.mjs";
import { checkFutureDated, checkQualifierChanged, datelineToIso, parseManuscript, preparationDate, runG1 } from "../../scripts/review/g1.mjs";
import { EVIDENCE_FIXTURES_DIR, FIXTURES_DIR } from "../../scripts/lanes/run.mjs";

const quiet = { log: null };
const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);

const ev = (over: any = {}) => ({
  id: "ev-1", signal_type: "interconnection_queue_delta", period_key: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30",
  direction: null, prior_count: null, current_count: null, pct_change: null, headline: "ERCOT queue: Sideoats Solar 1 — 167.60 MW generation (SOL); status Active",
  triggered_at: "2026-11-10T19:01:53Z", payload: { observed_at: "2026-11-09T06:40:10Z" }, ...over,
});

async function statePack(permit_events: any[]) {
  const b = briefs.find((x) => x.id.startsWith("fx000800"));
  const raw = await evidence.fetchRaw(b);
  const now = new Date("2026-11-11T12:00:00Z");
  raw.jw = { ...raw.jw, permit_events };
  return { b, now, pack: buildPack(raw, b, evidenceWindow(b, now), quiet) };
}

describe("jwEventDate (synthetic rows)", () => {
  it("prefers payload.observed_at, then triggered_at, then period_start — never period_end", () => {
    expect(jwEventDate(ev())).toEqual({ date: "2026-11-09", basis: "observed_at" });
    expect(jwEventDate(ev({ payload: {} }))).toEqual({ date: "2026-11-10", basis: "triggered_at" });
    expect(jwEventDate(ev({ payload: {}, triggered_at: null }))).toEqual({ date: "2026-11-01", basis: "period_start" });
    expect(jwEventDate({ period_end: "2026-11-30" })).toEqual({ date: null, basis: null });
  });
  it("a future period_end with an earlier triggered_at renders the earlier date", async () => {
    const { b, now, pack } = await statePack([ev({ payload: {} })]);
    const it = pack.items.find((x: any) => x.ref_kind === "jw_event");
    expect(it.date).toBe("2026-11-10");
    expect(it.published_at).toBe("2026-11-10");
    expect(it.forward_date).toBe("2026-11-30");
    const md = compose(b, pack, { now }).manuscript_md;
    expect(md).toContain("Nov 10, 2026");
    expect(md).not.toMatch(/\*Nov 30, 2026 ·/);
  });
  it("observed_at (Nov 9) beats triggered_at (Nov 10): the Texas S5 case", async () => {
    const { pack } = await statePack([ev()]);
    expect(pack.items.find((x: any) => x.ref_kind === "jw_event").date).toBe("2026-11-09");
  });
  it("an event dated after the preparation date is dropped and counted, not clamped", async () => {
    const { pack } = await statePack([ev({ id: "ev-future", payload: { observed_at: "2026-11-15T00:00:00Z" } }), ev({ id: "ev-ok" })]);
    const ids = pack.items.filter((x: any) => x.ref_kind === "jw_event").map((x: any) => x.id);
    expect(ids).toEqual(["ev-ok"]);
    expect(pack.hygiene.future_dated_dropped).toBe(1);
  });
  it("no item in a state pack is dated after the preparation date", async () => {
    const { pack } = await statePack([ev(), ev({ id: "b", payload: { observed_at: "2026-12-01T00:00:00Z" } })]);
    expect(pack.items.every((x: any) => x.date <= "2026-11-11")).toBe(true);
  });
});

describe("verifyQualifiers: hedges and date qualifiers round-trip (synthetic)", () => {
  const src = (t: string) => [{ text: [t] }];
  const cases: Array<[string, string, string, string]> = [
    ["casi €250 million", "Spain approved casi €250 million for the campus.", "Spain approved €250 million for the campus.", "qualifier_changed"],
    ["up to $600M", "The fund will deploy up to $600M in the region.", "The fund will deploy $600M in the region.", "qualifier_changed"],
    ["20–30 MW", "The first phase is 20–30 MW.", "The first phase is 20 MW.", "qualifier_changed"],
    ["by 2032 vs after 2032", "Capacity is expected after 2032.", "Capacity is expected by 2032.", "qualifier_changed"],
    ["from 2027-2031", "The program runs from 2027-2031.", "The program runs 2027-2031.", "qualifier_changed"],
  ];
  for (const [name, source, out, code] of cases) {
    it(`${name}: ${code}`, () => {
      const got = verifyQualifiers(out, src(source)).map((p: any) => p.code);
      expect(got).toEqual([code]);
    });
  }
  it("verbatim copies pass", () => {
    for (const s of ["Spain approved casi €250 million for the campus.", "The fund will deploy up to $600M in the region.", "The first phase is 20–30 MW.", "Capacity is expected after 2032.", "Capacity is expected by 2032."]) {
      expect(verifyQualifiers(s, src(s))).toEqual([]);
    }
  });
  it("an undated figure stays undated; attaching a year is flagged", () => {
    const source = "The utility reported $5 billion of planned capex.";
    expect(verifyQualifiers("The utility reported $5 billion of planned capex.", src(source))).toEqual([]);
    const bad = verifyQualifiers("The utility reported $5 billion in 2027 of planned capex.", src(source));
    expect(bad.map((p: any) => p.code)).toEqual(["year_attached"]);
    expect(bad[0].year).toBe("2027");
  });
  it("a dateline year next to a figure is not 'attached' (Nov 7, 2026)", () => {
    expect(verifyQualifiers("Oracle cancels $7 billion deal (Nov 7, 2026) [S1]", src("Oracle has canceled a $7 billion agreement."))).toEqual([]);
  });
  it("a table row that repeats the bare figure beside the full sentence passes", () => {
    const s = "Report counts over $214 billion in projects.";
    expect(verifyQualifiers(`$214 billion · ${s}`, src(s))).toEqual([]);
  });
  it("qualifiedFigures sees the hedge and the range as one figure", () => {
    expect(qualifiedFigures("up to $600M and 20–30 MW by 2032").map((f: any) => [f.qualifier, f.figure])).toEqual([["up to", "$600m"], [null, "20-30mw"], ["by", "2032"]]);
  });
});

describe("clipSentence never cuts inside the clause that carries the figure", () => {
  it("cuts at a clause break after the figure, or returns the sentence whole", () => {
    const s = "The operator confirmed that it will build up to 600 MW of capacity in the first phase, with the remaining capacity subject to future approvals and grid studies.";
    const c = clipSentence(s, 100);
    expect(c).toContain("up to 600 MW");
    expect(c.endsWith("…")).toBe(false);
    expect(clipSentence("up to $600M " + "x".repeat(300), 50).startsWith("up to $600M")).toBe(true);
    expect(clipSentence("Short.", 50)).toBe("Short.");
  });
});

describe("G1 future_dated and qualifier_changed", () => {
  const md = (extra = "") => `# T\n\n## 1. Section\n\n### Headline\n*Nov 11, 2026 · JW*\n\nQueue grew. [S1]\n\n## Signals to watch\n\n| When | Signal | Source |\n|---|---|---|\n| Dec 2026 | Hearing set. [S2] | [S2] |\n\n## Sources & methodology\n\nprepared Nov 11, 2026 ${extra}\n`;
  it("flags a dateline after the preparation date but exempts Signals to watch", () => {
    const out: any[] = [];
    const bad = md().replace("*Nov 11, 2026 · JW*", "*Nov 30, 2026 · JW*");
    checkFutureDated(parseManuscript(bad), [], preparationDate(bad), (code: string, message: string, extra = {}) => out.push({ code, ...extra }));
    expect(out.map((o) => o.code)).toEqual(["future_dated"]);
    const ok: any[] = [];
    checkFutureDated(parseManuscript(md()), [{ ref: "S2", published_at: "2026-12-15" }], "2026-11-11", (c: string) => ok.push(c));
    expect(ok).toEqual([]); // S2 is cited only under Signals to watch
  });
  it("flags a ref dated after the preparation date when it is cited in the body", () => {
    const out: any[] = [];
    checkFutureDated(parseManuscript(md()), [{ ref: "S1", published_at: "2026-11-30" }], "2026-11-11", (code: string, message: string, extra = {}) => out.push({ code, ...extra }));
    expect(out.map((o) => o.code)).toEqual(["future_dated"]);
  });
  it("datelineToIso and preparationDate", () => {
    expect(datelineToIso("Nov 9, 2026")).toBe("2026-11-09");
    expect(datelineToIso("undated")).toBeNull();
    expect(preparationDate(md())).toBe("2026-11-11");
    expect(preparationDate("", "2026-12-01T00:00:00Z")).toBe("2026-12-01");
  });
  it("checkQualifierChanged flags a dropped hedge against the cited source text", () => {
    const out: any[] = [];
    const parsed = parseManuscript("## 1. A\n\nThe fund will deploy $600M in the region. [S1]\n");
    const resolved = new Map([[1, [{ resolved: true, text: "The fund will deploy up to $600M in the region.", title: "t" }]]]);
    checkQualifierChanged(parsed, resolved, (code: string, message: string, extra = {}) => out.push({ code, ...extra }));
    expect(out.map((o) => o.code)).toEqual(["qualifier_changed"]);
  });
  it("freshly composed state drafts (fx000800, fx000900) carry 0 future_dated and 0 qualifier_changed", async () => {
    for (const p of ["fx000800", "fx000900"]) {
      const b = briefs.find((x) => x.id.startsWith(p));
      const raw = await evidence.fetchRaw(b);
      const now = new Date(raw.captured_at);
      const pk = buildPack(raw, b, evidenceWindow(b, now), quiet);
      const d = compose(b, pk, { now });
      const resolve = (u: string) => {
        const it = pk.items.find((i: any) => i.url === u);
        return it ? { resolved: true, kind: it.ref_kind, id: it.id, text: it.text.join("\n"), title: it.headline, published_at: it.published_at } : { resolved: false };
      };
      const r = runG1({ draft: { ...d, briefing_type: b.briefing_type }, briefing: b, pages: 9, resolve, now });
      const codes = r.blockers.map((x: any) => x.code);
      expect(codes.filter((c: string) => c === "future_dated" || c === "qualifier_changed" || c === "year_attached"), p).toEqual([]);
    }
  });
});
