// BL3-07 (FDY-331): Jurisdiction Watch events dated by observed_at / triggered_at (never period_end),
// a future guard, verbatim hedges and date qualifiers, whole sentences only, names copied exactly.
//
// The five FDY-284 pilot state drafts are not in the repo's fixtures, so the "five pilot state fixtures"
// below are SYNTHETIC packs built from the pattern the pilot found (period_end 2026-11-30, observed and
// triggered Nov 9 CT). They are not a pilot replay. The Texas lane fixture (fx000800) is real production
// data; its event 745f85b7 carries the triggered_at / payload.observed_at the coordinator read from
// production (2026-11-09 07:00:00Z / 2026-11-09T06:40:10Z) — the other 23 captured events have neither.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildPack, createFixtureEvidence, ctDate, evidenceWindow, jwEventDate } from "../../scripts/lanes/evidence.mjs";
import { compose, wholeSentences, ENTRY_MAX_SENTENCE_CHARS } from "../../scripts/lanes/compose.mjs";
import { verifyQualifiers } from "../../scripts/lanes/qualifiers.mjs";
import { runG1, parseManuscript, checkFutureDated, checkQualifiers } from "../../scripts/review/g1.mjs";
import { createSupabaseDb } from "../../scripts/review/run.mjs";
import { EVIDENCE_FIXTURES_DIR, FIXTURES_DIR } from "../../scripts/lanes/run.mjs";

const quiet = { log: null };
const PREP = new Date("2026-11-09T15:00:00Z"); // 09:00 CT, Nov 9

function packResolver(pk: any) {
  const pool = [...pk.items, pk.jurisdiction_record, pk.entity].filter(Boolean);
  return (url: string, { ref }: any) => {
    const it = pool.find((x: any) => ref.id != null && x.id === ref.id && x.ref_kind === ref.kind) ?? pool.find((x: any) => x.url === url);
    if (!it) return { resolved: false };
    return { resolved: true, kind: it.ref_kind, id: it.id, text: it.text.join("\n"), title: it.title, published_at: it.published_at, dates: [it.date].filter(Boolean) };
  };
}
const codes = (r: any) => r.blockers.map((b: any) => b.code);

// ---------------------------------------------------------------------------------------------
// Event date
// ---------------------------------------------------------------------------------------------

describe("JW event date = payload.observed_at ?? triggered_at, as a CT day; never period_end", () => {
  it("prefers observed_at, falls back to triggered_at, converts to US Central, ignores period_end", () => {
    const base = { period_start: "2026-11-01", period_end: "2026-11-30" };
    expect(jwEventDate({ ...base, triggered_at: "2026-11-09T07:00:00Z", payload: { observed_at: "2026-11-09T06:40:10Z" } })).toBe("2026-11-09");
    expect(jwEventDate({ ...base, triggered_at: "2026-11-09T07:00:00Z" })).toBe("2026-11-09");
    expect(jwEventDate({ ...base, triggered_at: "2026-11-10T03:00:00Z" })).toBe("2026-11-09"); // 21:00 CT on Nov 9
    expect(jwEventDate({ ...base, payload: '{"observed_at":"2026-11-08T12:00:00Z"}' })).toBe("2026-11-08");
    expect(jwEventDate(base)).toBeNull();
    expect(ctDate("2026-11-09T06:40:10Z")).toBe("2026-11-09");
  });
  it("a future period_end with an earlier triggered_at renders the earlier date; period_end survives only as forward_date", () => {
    const raw = jurisdictionRaw("Texas", "texas", [
      jwEvent("ev-1", "ERCOT queue: BM Freestone Energy Center II — 990.60 MW generation (GAS); status Active, 2-System Impact", "2026-11-09T07:00:00Z", "2026-11-09T06:40:10Z"),
    ]);
    const brief = stateBrief("Texas", "US-TX");
    const pk = buildPack(raw, brief, evidenceWindow(brief, PREP), quiet);
    const ev = pk.items.find((i: any) => i.id === "ev-1");
    expect(ev.date).toBe("2026-11-09");
    expect(ev.published_at).toBe("2026-11-09");
    expect(ev.forward_date).toBe("2026-11-30");
    expect(ev.period_key).toBe("2026-11");
    const d = compose(brief, pk, { now: PREP });
    expect(d.manuscript_md).toMatch(/\*Nov 9, 2026 · Jurisdiction Watch signal\*/);
    expect(d.manuscript_md).not.toMatch(/Nov 30, 2026|2026-11-30/);
    expect(d.source_refs.find((r: any) => r.id === "ev-1")!.published_at).toBe("2026-11-09");
  });
  it("future guard: drops an item whose EVENT date is after the preparation day, never on forward_date, and logs it", () => {
    const log = vi.fn();
    const raw = jurisdictionRaw("Texas", "texas", [
      jwEvent("ok", "ERCOT queue: Grasshopper BESS — 250.94 MW generation (OTH); status Active", "2026-11-09T07:00:00Z", null, "2026-12-31"),
      jwEvent("future", "ERCOT queue: Great Rock Energy Center III — 990.60 MW generation (GAS); status Active", "2026-11-11T15:00:00Z", null),
      jwEvent("undated", "ERCOT queue: Undated project — 100 MW generation (SOL); status Active", null, null),
    ]);
    const brief = stateBrief("Texas", "US-TX");
    const pk = buildPack(raw, brief, evidenceWindow(brief, PREP), { log });
    expect(pk.items.map((i: any) => i.id)).toContain("ok"); // forward_date 2026-12-31 does not drop it
    expect(pk.items.map((i: any) => i.id)).not.toContain("future");
    expect(pk.items.map((i: any) => i.id)).not.toContain("undated");
    expect(pk.dating).toMatchObject({ prepared: "2026-11-09", future_dated: 1, undated_event: 1 });
    expect(log.mock.calls.map((c) => c[0]).join("\n")).toMatch(/dropped 1 item\(s\) dated after the preparation day 2026-11-09 and 1 Jurisdiction Watch event\(s\) with no observed_at\/triggered_at/);
  });
  it("the real Texas fixture: event 745f85b7 is dated Nov 9 (forward_date Nov 30); no ref or dateline is dated after preparation", async () => {
    const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
    const b = briefs.find((x) => x.id.startsWith("fx000800"));
    const raw = await createFixtureEvidence(EVIDENCE_FIXTURES_DIR).fetchRaw(b);
    const now = new Date(raw.captured_at);
    const pk = buildPack(raw, b, evidenceWindow(b, now), quiet);
    const ev = pk.items.find((i: any) => i.id === "745f85b7-c34e-417a-9eff-fd684707e664");
    expect(ev).toMatchObject({ date: "2026-11-09", published_at: "2026-11-09", forward_date: "2026-11-30" });
    expect(pk.dating.undated_event).toBe(0); // all 24 captured events carry triggered_at + payload.observed_at (read-only recapture 2026-11-13)
    const d = compose(b, pk, { now });
    for (const r of d.source_refs) if (r.published_at) expect(String(r.published_at) <= "2026-11-09").toBe(true);
    const g = runG1({ draft: { ...d, briefing_type: b.briefing_type }, briefing: b, pages: 9, resolve: packResolver(pk), prepared: ctDate(now) });
    expect(codes(g)).not.toContain("future_dated");
    expect(codes(g)).not.toContain("qualifier_changed");
    expect(codes(g)).not.toContain("number_mismatch");
  });
});

// ---------------------------------------------------------------------------------------------
// Five synthetic pilot state fixtures → G1 date check
// ---------------------------------------------------------------------------------------------

function jwEvent(id: string, headline: string, triggered: string | null, observed: string | null, periodEnd = "2026-11-30") {
  return { id, signal_type: "interconnection_queue_delta", period_key: periodEnd.slice(0, 7), period_start: `${periodEnd.slice(0, 7)}-01`, period_end: periodEnd, headline, triggered_at: triggered, payload: observed ? { observed_at: observed } : {} };
}
function stateBrief(name: string, jid: string) {
  return { id: `synth-${jid.toLowerCase()}`, title: name, tier: "standard", briefing_type: "jurisdiction", jurisdiction_id: jid, version: 1 };
}
function jurisdictionRaw(name: string, slug: string, events: any[], signals: any[] = []) {
  return {
    captured_at: PREP.toISOString(),
    taxonomy: { themes: [], domains: [], subdomains: [] },
    signals: signals.length
      ? signals
      : [
          sig(`${slug}-1`, "2026-11-06", `${name} lawmakers filed a bill to pause data center permits for up to 12 months.`, `https://wire.example/${slug}-bill-pause-permits`),
          sig(`${slug}-2`, "2026-11-04", `A utility in ${name} expects about 4 GW of new large-load requests by 2030.`, `https://wire.example/${slug}-utility-large-load`),
          sig(`${slug}-3`, "2026-10-30", `${name} approved a tax abatement worth casi $250 million for a hyperscale campus.`, `https://wire.example/${slug}-tax-abatement-campus`),
        ],
    artifacts: [],
    companies: [],
    jurisdiction: { id: `j-${slug}`, name, slug, current_tier: "Leading", current_score: 71.5, last_scored_date: "2026-07-13", jps_trend: "stable", iso_rto: "ERCOT", jps_history: [] },
    jw: { moratoria: [], puc: [], permit_events: events, facilities: [], incentives: [] },
  };
}
function sig(id: string, date: string, text: string, url: string, extra: any = {}) {
  return {
    id,
    fired_at: `${date}T12:00:00Z`,
    event_date: date,
    framing: text,
    faradays_take: text,
    domain_tags: extra.domain_tags ?? ["D3"],
    subdomain_tags: extra.subdomain_tags ?? ["D3.2"],
    company_tags: extra.company_tags ?? [],
    source_url: url,
    artifact_id: `art-${id}`,
    artifact: { title: extra.title ?? `${id} headline`, source_name: "Example Wire", summary: text, published_at: `${date}T12:00:00Z`, license_status: null, source_url: url },
  };
}

describe("G1 future_dated — five synthetic pilot state fixtures", () => {
  const STATES: [string, string, string][] = [
    ["Texas", "US-TX", "texas"],
    ["Indiana", "US-IN", "indiana"],
    ["Virginia", "US-VA", "virginia"],
    ["Georgia", "US-GA", "georgia"],
    ["Arizona", "US-AZ", "arizona"],
  ];
  it("each regenerated synthetic state draft reports 0 future-dated items (period_end 2026-11-30, observed Nov 9 CT)", () => {
    for (const [name, jid, slug] of STATES) {
      const raw = jurisdictionRaw(name, slug, [
        jwEvent(`${slug}-q1`, `Queue: ${name} Energy Center II — 990.60 MW generation (GAS); status Active`, "2026-11-09T07:00:00Z", "2026-11-09T06:40:10Z"),
        jwEvent(`${slug}-q2`, `Queue: ${name} Solar I — 250.94 MW generation (SOL); status Active`, "2026-11-08T07:00:00Z", null),
        jwEvent(`${slug}-q3`, `Queue: ${name} Storage III — 120 MW generation (OTH); status Active`, "2026-11-12T07:00:00Z", null), // after prep: dropped
      ]);
      const brief = stateBrief(name, jid);
      const pk = buildPack(raw, brief, evidenceWindow(brief, PREP), quiet);
      const d = compose(brief, pk, { now: PREP });
      const g = runG1({ draft: { ...d, briefing_type: "jurisdiction" }, briefing: brief, pages: 9, resolve: packResolver(pk), prepared: ctDate(PREP) });
      expect(g.blockers.filter((b: any) => b.code === "future_dated"), name).toEqual([]);
      expect(codes(g), name).toEqual([]);
      expect(d.manuscript_md).not.toMatch(/2026-11-30|Nov 30, 2026|2026-11-12|Nov 12, 2026/);
    }
  });
  it("flags a future dateline and a future Sources date; exempts Signals to watch", () => {
    const md = [
      "## Power & utility regulation",
      "",
      "### Queue item",
      "*Nov 30, 2026 · Jurisdiction Watch signal*",
      "",
      "A queue entry was filed. [S1]",
      "",
      "## Signals to watch",
      "",
      "| When | Signal | Source |",
      "|---|---|---|",
      "| Nov 30, 2026 | The period closes. | [S1] |",
      "",
      "## Sources & methodology",
      "",
      "| Ref | Source | Publisher | Date | Faraday record |",
      "|---|---|---|---|---|",
      "| S1 | [Queue](https://x.example/q) | JW | 2026-11-30 | jw_event e1 |",
    ].join("\n");
    const out: any[] = [];
    checkFutureDated(parseManuscript(md), [{ ref: "S1", published_at: "2026-11-30" }], "2026-11-09", (code: string, message: string, extra: any = {}) => out.push({ code, ...extra }));
    expect(out.map((o) => o.section ?? `S${o.marker}`)).toEqual(["Power & utility regulation", "S1"]);
    expect(out.every((o) => o.code === "future_dated")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Hedges and date qualifiers
// ---------------------------------------------------------------------------------------------

const HEDGE_SOURCES = [
  "Spain approved casi €250 million for grid upgrades.",
  "The fund raised up to $600M for new capacity.",
  "The campus will draw 20–30 MW at full load.",
  "The operator expects the first hall online by 2032.",
  "A second phase follows after 2032.",
  "The developer bought 66 acres for $76.5M.",
];

describe("hedges and date qualifiers are copied verbatim", () => {
  it("hedge/qualifier fixtures round-trip through the composer; an undated figure stays undated", () => {
    const brief = stateBrief("Spain", "ES");
    const raw = jurisdictionRaw(
      "Spain",
      "spain",
      [],
      HEDGE_SOURCES.map((t, i) => sig(`h${i}`, `2026-11-0${i + 1}`, t, `https://wire.example/hedge-fixture-number-${i}`)),
    );
    const pk = buildPack(raw, brief, evidenceWindow(brief, PREP), quiet);
    const d = compose(brief, pk, { now: PREP });
    for (const t of HEDGE_SOURCES) expect(d.manuscript_md).toContain(t);
    expect(d.manuscript_md).not.toMatch(/\$76\.5M in 20\d\d|\$76\.5M \(20\d\d\)/);
    // Every cited prose line (entries, argument, Take facts) keeps its sources' hedges and qualifiers.
    const prose = d.manuscript_md.split("## Sources & method")[0].split("\n").filter((l: string) => /\[S\d+\]/.test(l) && !/^[#|*]/.test(l));
    expect(prose.length).toBeGreaterThan(3);
    for (const line of prose) expect(verifyQualifiers(line, pk.items), line).toEqual([]);
    const g = runG1({ draft: { ...d, briefing_type: "jurisdiction" }, briefing: brief, pages: 9, resolve: packResolver(pk), prepared: ctDate(PREP) });
    expect(codes(g)).not.toContain("qualifier_changed");
  });
  it("verifyQualifiers reports a dropped hedge, a collapsed range, a changed date qualifier and an added year", () => {
    const items = [{ text: HEDGE_SOURCES }];
    const kinds = (o: string) => verifyQualifiers(o, items).map((p: any) => `${p.kind}:${p.figure ?? p.year}:${p.output_qualifier ?? "-"}/${p.source_qualifier ?? "-"}`);
    expect(kinds("Spain approved €250 million for grid upgrades.")).toEqual(["hedge:€250 million:-/casi"]);
    expect(kinds("The fund raised $600M for new capacity.")).toEqual(["hedge:$600M:-/up to"]);
    expect(kinds("The campus will draw 30 MW at full load.")).toEqual(["hedge:30 MW:-/range:20"]);
    expect(kinds("The operator expects the first hall online after 2032.")).toEqual(["date_qualifier:2032:after/by"]);
    expect(kinds("The developer bought 66 acres for $76.5M in 2026.")).toEqual(["year_added:66 acres:-/-", "year_added:$76.5M:-/-"]);
    expect(kinds("Spain approved casi €250 million for grid upgrades. The fund raised up to $600M.")).toEqual([]);
  });
  it("G1 checkQualifiers blocks a dropped hedge; an added hedge is only a warning", () => {
    const md = "## The argument\n\nThe fund raised $600M for new capacity. [S1] The developer bought about 66 acres for $76.5M. [S2]\n";
    const out: any[] = [];
    checkQualifiers(parseManuscript(md), (n: number) => (n === 1 ? HEDGE_SOURCES[1] : HEDGE_SOURCES[5]), (code: string, message: string, extra: any = {}) => out.push({ code, ...extra }));
    expect(out.map((o) => `${o.code}:${o.figure}:${o.severity ?? "block"}`)).toEqual(["qualifier_changed:$600M:block", "qualifier_changed:66 acres:warn"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Whole sentences only
// ---------------------------------------------------------------------------------------------

describe("never print a truncated sentence", () => {
  it("cuts a long summary at the last full sentence that fits; uses the first sentence whole when none fits", () => {
    const a = "A".repeat(150) + ".";
    const b = "B".repeat(150) + ".";
    const c = "C".repeat(150) + ".";
    expect(wholeSentences([a, b, c], 3)).toEqual([a, b]); // 151 + 1 + 151 = 303 ≤ 380; adding c would exceed
    const long = "L".repeat(500) + ".";
    expect(wholeSentences([long, a], 3)).toEqual([long]);
    expect(wholeSentences([a, long, b], 3)).toEqual([a]); // never skips over a sentence to reach a later one
    expect(ENTRY_MAX_SENTENCE_CHARS).toBe(380);
  });
  it("every entry body and table cell in the fixture drafts is made of whole record sentences", async () => {
    const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
    const ev = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
    for (const p of ["fx000100", "fx000300", "fx000800", "fx000900"]) {
      const b = briefs.find((x) => x.id.startsWith(p));
      const raw = await ev.fetchRaw(b);
      const now = new Date(raw.captured_at);
      const pk = buildPack(raw, b, evidenceWindow(b, now), quiet);
      const d = compose(b, pk, { now });
      const pool = new Set(pk.items.flatMap((i: any) => i.text.map((t: string) => t.trim())));
      const body = d.manuscript_md.split("## Sources & method")[0];
      // Table rows of the figure / at-a-glance / signals tables: the sentence cell is a whole record sentence.
      for (const line of body.split("\n")) {
        if (!line.startsWith("| ") || /^\|\s*(Figure|When|Party|---)/.test(line)) continue;
        const cell = line.split(" | ")[1]?.replace(/\s*\[S\d+\]$/, "").replace(/\\\|/g, "|").trim();
        if (cell && /[.!?]$/.test(cell) && cell.length > 40) expect(pool.has(cell), `${p}: ${cell.slice(0, 60)}`).toBe(true);
        expect(line).not.toMatch(/\w… \|/); // no clipped sentence cell
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Names copied character for character
// ---------------------------------------------------------------------------------------------

describe("entity names are copied character for character from the source record", () => {
  it("prints Meeza (never Meesa), and canonical names with diacritics, exactly", () => {
    const companies = [
      { company_uid: "cmp_meeza0000000001", canonical_name: "Meeza QSTP-LLC", company_type: "operator" },
      { company_uid: "cmp_orsted000000001", canonical_name: "Ørsted A/S", company_type: "utility" },
    ];
    const signals = [
      sig("m1", "2026-11-06", "Meeza opened a 24 MW data center in Doha's free zone.", "https://wire.example/meeza-opens-doha-data-center", { company_tags: ["cmp_meeza0000000001"] }),
      sig("m2", "2026-11-05", "Meeza signed a cooling contract with Ørsted A/S for its second hall.", "https://wire.example/meeza-orsted-cooling-contract", { company_tags: ["cmp_meeza0000000001", "cmp_orsted000000001"] }),
      sig("m3", "2026-11-04", "Ørsted A/S agreed to supply 50 MW of offshore wind to a Danish campus.", "https://wire.example/orsted-offshore-wind-supply", { company_tags: ["cmp_orsted000000001"] }),
    ];
    const raw = { captured_at: PREP.toISOString(), taxonomy: { themes: [], domains: [{ domain_code: "D3", domain_name: "Grid & Regulatory" }], subdomains: [{ subdomain_code: "D3.2", domain_code: "D3", display_name: "Policy", theme_tags: [] }] }, signals, artifacts: [], companies };
    const brief = { id: "synth-names", title: "Policy", tier: "standard", briefing_type: "thread", thread_id: "D3.2", version: 1 };
    const pk = buildPack(raw, brief, evidenceWindow(brief, PREP), quiet);
    const d = compose(brief, pk, { now: PREP });
    expect(d.manuscript_md).toContain("Meeza opened a 24 MW data center in Doha's free zone.");
    expect(d.manuscript_md).toMatch(/\| Meeza QSTP-LLC \| operator — named in 2 Signals \|/);
    expect(d.manuscript_md).toMatch(/\| Ørsted A\/S \| utility — named in 2 Signals \|/);
    expect(d.manuscript_md).not.toMatch(/Meesa|Orsted A\/S/);
  });
});

// ---------------------------------------------------------------------------------------------
// The review chain sees the date the generator printed
// ---------------------------------------------------------------------------------------------

describe("review/run.mjs live resolver dates a JW event like the generator", () => {
  it("published_at = observed_at day; period_end is not offered as a date", async () => {
    const row = { id: "745f85b7-c34e-417a-9eff-fd684707e664", headline: "ERCOT queue: BM Freestone Energy Center II — 990.60 MW generation (GAS); status Active, 2-System Impact", period_key: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", triggered_at: "2026-11-09T07:00:00Z", payload: { observed_at: "2026-11-09T06:40:10Z" } };
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) };
    const client: any = { from: () => q };
    const db: any = createSupabaseDb(client, { briefingResolve: true });
    const res = await db.resolveAsync(`https://faraday-jurisdiction-watch.vercel.app/jurisdiction/texas#signal-${row.id}`, { kind: "jw_event", id: row.id });
    expect(res.resolved).toBe(true);
    expect(res.published_at).toBe("2026-11-09");
    expect(res.dates).not.toContain("2026-11-30");
  });
});
