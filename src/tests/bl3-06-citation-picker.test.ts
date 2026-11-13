// BL3-06 (FDY-330): citation picker + source hygiene.
//
// The FDY-306 pilot drafts (Memory HBM 0beac77c, Sovereign AI Race 3315ebbf, Capital Concentration
// 4ec70963, Japan 38ed7474) are not in the repo's fixtures, so the cases named in FDY-306 are rebuilt
// here as SYNTHETIC packs (labelled "synthetic" below). They are not a pilot replay. The seven captured
// lane fixture packs (scripts/lanes/fixtures/evidence) are real production records.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPack,
  citabilityReason,
  createFixtureEvidence,
  differentTitles,
  evidenceWindow,
  extractFigures,
  hostOf,
  isCitableSource,
  isIndexUrl,
  isRedirectUrl,
  isVendorOrSponsored,
  publisherOf,
} from "../../scripts/lanes/evidence.mjs";
import { compose, createRegistry, HOUSEKEEPING } from "../../scripts/lanes/compose.mjs";
import { runG1, unitsOf, parseManuscript, checkSourceHygiene, checkHousekeepingMarkers } from "../../scripts/review/g1.mjs";
import { EVIDENCE_FIXTURES_DIR, FIXTURES_DIR } from "../../scripts/lanes/run.mjs";

const quiet = { log: null };
const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
const SAMPLE = ["fx000100", "fx000300", "fx000500", "fx000600", "fx000700", "fx000800", "fx000900"];
async function fixture(prefix: string) {
  const b = briefs.find((x) => x.id.startsWith(prefix));
  const raw = await evidence.fetchRaw(b);
  const now = new Date(raw.captured_at);
  return { b, now, pack: buildPack(raw, b, evidenceWindow(b, now), quiet) };
}
const PAGES_OK: Record<string, number> = { deep: 12, standard: 9, profile: 2 };

/** G1 resolver over the records a draft was composed from (record text, as the review fixtures use). */
function packResolver(pk: any) {
  const pool = [...pk.items, pk.jurisdiction_record, pk.entity].filter(Boolean);
  return (url: string, { ref }: any) => {
    const it = pool.find((x: any) => ref.id != null && x.id === ref.id && x.ref_kind === ref.kind) ?? pool.find((x: any) => x.url === url);
    if (!it) return { resolved: false };
    return { resolved: true, kind: it.ref_kind, id: it.id, text: it.text.join("\n"), title: it.title, published_at: it.published_at, dates: [it.date].filter(Boolean) };
  };
}

/** Every body sentence that carries its own marker must be text of THAT marker's record. */
function markerIntegrity(d: any, pk: any) {
  const pool = [...pk.items, pk.jurisdiction_record, pk.entity].filter(Boolean);
  const recOf = (n: number) => {
    const r = d.source_refs[n - 1];
    return pool.find((x: any) => x.id === r.id && x.ref_kind === r.kind);
  };
  const bad: string[] = [];
  let checked = 0;
  for (const s of parseManuscript(d.manuscript_md).sections as any[]) {
    if (s.isSources) continue;
    for (const u of unitsOf(s.body)) {
      if (u.kind !== "sentence" || /^\*\*What to watch/.test(u.text)) continue;
      const own = [...u.text.matchAll(/\[S(\d+)\]/g)].map((m) => Number(m[1]));
      if (own.length !== 1) continue;
      const core = u.text.replace(/\s*\[S\d+\]/g, "").replace(/^\*Claim: /, "").replace(/\*$/, "").replace(/\\\|/g, "|").trim();
      const rec = recOf(own[0]);
      const text = rec?.text.join(" ") ?? "";
      checked += 1;
      if (!text.includes(core) && !text.includes(core.replace(/\.$/, ""))) bad.push(`[S${own[0]}] ${core.slice(0, 90)}`);
    }
  }
  return { bad, checked };
}

const TAXONOMY = {
  themes: [],
  domains: [{ domain_code: "D5", domain_name: "Hyperscaler Activity" }],
  subdomains: [{ subdomain_code: "D5.1", domain_code: "D5", display_name: "Hyperscale Capex", theme_tags: [] }],
};
const sig = (id: string, date: string, text: string, url: string, extra: any = {}) => ({
  id,
  fired_at: `${date}T12:00:00Z`,
  event_date: date,
  framing: text,
  faradays_take: text,
  domain_tags: ["D5"],
  subdomain_tags: ["D5.1"],
  company_tags: [],
  source_url: url,
  artifact_id: `art-${id}`,
  artifact: { title: `${id} headline`, source_name: "Example Wire", summary: text, published_at: `${date}T12:00:00Z`, license_status: null, source_url: url, ...(extra.artifact ?? {}) },
  ...(extra.signal ?? {}),
});
const threadBrief = { id: "synth-0001", title: "Hyperscale Capex", tier: "standard", briefing_type: "thread", thread_id: "D5.1", version: 1 };
const NOW_T = new Date("2026-11-09T12:00:00Z");
const synthPack = (signals: any[], artifacts: any[] = [], opts: any = quiet) =>
  buildPack({ captured_at: NOW_T.toISOString(), taxonomy: TAXONOMY, signals, artifacts, companies: [] }, threadBrief, evidenceWindow(threadBrief, NOW_T), opts);

// ---------------------------------------------------------------------------------------------
// Decision 1 / amendment 7 — the marker is the record's own
// ---------------------------------------------------------------------------------------------

describe("citation picker — the marker is the marker of the record the clause came from", () => {
  it("synthetic (FDY-306 Memory HBM case): three records, the WRONG record sorts first by date and by id; every clause cites its own record", () => {
    // "a-crusoe" is newest and sorts first by id; "z-amat" carries the $5 billion / 600,000-sq-ft clause.
    const pk = synthPack([
      sig("a-crusoe", "2026-11-06", "Crusoe energized a 1.2 GW campus in Abilene. The site runs on a dedicated 345 kV substation.", "https://wire.example/crusoe-abilene-campus-energized"),
      sig("m-micron", "2026-11-05", "Micron shipped 12-high HBM4 stacks to two customers. Volume ramps in 2027.", "https://wire.example/micron-hbm4-stacks-ship"),
      sig("z-amat", "2026-11-04", "Applied Materials will invest $5 billion in a 600,000-sq-ft equipment hub. Construction starts in 2027.", "https://wire.example/applied-materials-equipment-hub"),
    ]);
    expect(pk.items[0].id).toBe("a-crusoe");
    const d = compose(threadBrief, pk, { now: NOW_T });
    const refOf = (id: string) => d.source_refs.find((r: any) => r.id === id)!.ref;
    const amat = refOf("z-amat");
    expect(amat).not.toBe(refOf("a-crusoe"));
    const fives = [...d.manuscript_md.matchAll(/\$5 billion[^\[\n]*\[(S\d+)\]/g)];
    expect(fives.length).toBeGreaterThan(0);
    for (const m of fives) expect(m[1]).toBe(amat);
    for (const m of d.manuscript_md.matchAll(/1\.2 GW[^\[\n]*\[(S\d+)\]/g)) expect(m[1]).toBe(refOf("a-crusoe"));
    for (const m of d.manuscript_md.matchAll(/HBM4[^\[\n]*\[(S\d+)\]/g)) expect(m[1]).toBe(refOf("m-micron"));
    const integrity = markerIntegrity(d, pk);
    expect(integrity.bad).toEqual([]);
    expect(integrity.checked).toBeGreaterThan(3);
    const r = runG1({ draft: { ...d, briefing_type: "thread" }, briefing: threadBrief, pages: 9, resolve: packResolver(pk) });
    expect(r.blockers.filter((b: any) => b.code === "number_mismatch")).toEqual([]);
    expect(r.stats.numbers_matched).toBeGreaterThan(3);
  });
  it("every own-marker sentence in all seven fixture drafts is text of the record its marker names", async () => {
    for (const p of SAMPLE) {
      const { b, now, pack: pk } = await fixture(p);
      const d = compose(b, pk, { now });
      const integrity = markerIntegrity(d, pk);
      expect(integrity.bad, p).toEqual([]);
      expect(integrity.checked).toBeGreaterThan(3);
    }
  });
  it("the registry keys on the record, never the URL: two records sharing a URL get two markers", () => {
    const reg = createRegistry();
    const a = { ref_kind: "artifact", id: "a1", url: "https://www.datacenterdynamics.com/en/news/", title: "A", text: ["A raised $5 billion."] };
    const b = { ref_kind: "artifact", id: "a2", url: "https://www.datacenterdynamics.com/en/news/", title: "B", text: ["B built 1.2 GW."] };
    expect(reg.register(a)).toBe("[S1]");
    expect(reg.register(b)).toBe("[S2]");
    expect(reg.register(a)).toBe("[S1]");
    expect(reg.cite(b)).toBe("[S2]");
  });
  it("fact() refuses a sentence that is not the cited record's own", () => {
    const reg = createRegistry();
    const a = { ref_kind: "signal", id: "s1", url: "https://x.example/a", title: "A", text: ["Applied Materials will invest $5 billion."] };
    const b = { ref_kind: "signal", id: "s2", url: "https://x.example/b", title: "B", text: ["Crusoe energized 1.2 GW."] };
    expect(reg.fact(a, a.text[0], "t1")).toBe("Applied Materials will invest $5 billion. [S1]");
    expect(() => reg.fact(b, a.text[0], "t1")).toThrow(/citation picker/);
  });
});

// ---------------------------------------------------------------------------------------------
// Decision 2 / amendment 5 — housekeeping
// ---------------------------------------------------------------------------------------------

describe("housekeeping sentences", () => {
  it("synthetic (FDY-306 Sovereign AI Race / Capital Concentration case): a headline figure never rides a housekeeping line with a marker", () => {
    // The artifact title carries "$9B"; the Signal text does not. The old intro printed the headline + [Sn].
    const pk = synthPack([
      sig("fund", "2026-11-06", "A sovereign fund closed a new data center vehicle. The fund targets Gulf capacity.", "https://wire.example/sovereign-fund-closes-vehicle", { artifact: { title: "Sovereign Fund Closes $9B Data Center Vehicle" } }),
      sig("gpu", "2026-11-05", "A national AI program ordered 18,000 GPUs. Deliveries begin in 2027.", "https://wire.example/national-ai-program-gpu-order", { artifact: { title: "Program Orders GPUs Worth $5B" } }),
      sig("third", "2026-11-04", "Microsoft signed a 300 MW lease in Ohio. The lease runs 15 years.", "https://wire.example/microsoft-ohio-lease-signed"),
    ]);
    const d = compose(threadBrief, pk, { now: NOW_T });
    for (const line of d.manuscript_md.split("\n")) {
      if (/^The record (holds \d+|in this Briefing is)/.test(line)) {
        expect(line).not.toMatch(/\[S\d+\]/);
        expect(line).not.toMatch(/\$9B|\$5B/);
      }
    }
    const r = runG1({ draft: { ...d, briefing_type: "thread" }, briefing: threadBrief, pages: 9, resolve: packResolver(pk) });
    expect(r.blockers.map((b: any) => b.code)).not.toContain("number_mismatch");
    expect(r.blockers.map((b: any) => b.code)).not.toContain("housekeeping_cited");
  });
  it("carry no marker and no figure and sit in their own paragraph, in every fixture draft", async () => {
    for (const p of SAMPLE) {
      const { b, now, pack: pk } = await fixture(p);
      const d = compose(b, pk, { now });
      if (b.tier !== "profile") expect(d.meta.housekeeping.length).toBeGreaterThan(0);
      const paras = d.manuscript_md.split(/\n\s*\n/).map((x: string) => x.trim());
      for (const h of d.meta.housekeeping) {
        expect(h).not.toMatch(/\[S\d+\]|⟦/);
        expect(extractFigures(h)).toEqual([]);
        expect(HOUSEKEEPING.some((re: RegExp) => re.test(h))).toBe(true);
        expect(paras).toContain(h);
      }
    }
  });
  it("printed counts equal the final Sources table (amendment 5)", async () => {
    for (const p of SAMPLE.filter((x) => x !== "fx000600" && x !== "fx000700")) {
      const { b, now, pack: pk } = await fixture(p);
      const d = compose(b, pk, { now });
      const n = d.source_refs.length;
      expect(d.manuscript_md).toMatch(new RegExp(`\\*\\*Evidence window:\\*\\* [^\\n]*, ${n} sources`));
      if (b.tier === "standard") expect(d.manuscript_md).toMatch(new RegExp(`^The record in this Briefing is ${n} sourced items`, "m"));
      // Each section's "N dated Signals" = the Sources-table rows cited under that section.
      const sections = d.manuscript_md.split(/\n(?=## )/);
      let seen = 0;
      sections.forEach((sec: string) => {
        const m = sec.match(/^The record holds (\d+) dated Signals? (?:for this Sector|under this heading) in the Sources table/m);
        if (!m) return;
        seen += 1;
        const cited = new Set([...sec.matchAll(/\[S(\d+)\]/g)].map((x) => x[1]));
        expect(Number(m[1])).toBe(cited.size);
      });
      expect(seen).toBeGreaterThan(0);
      // Take shares are over the whole table.
      for (const m of d.manuscript_md.matchAll(/(\d+) of the (\d+) sources/g)) expect(Number(m[2])).toBe(n);
      // Register: "named in N Signals" never exceeds the table.
      for (const m of d.manuscript_md.matchAll(/named in (\d+) Signals?/g)) expect(Number(m[1])).toBeLessThanOrEqual(n);
    }
  });
  it("the registry refuses a housekeeping sentence with a marker or a Signal figure", () => {
    const reg = createRegistry();
    expect(() => reg.housekeeping("The record holds 4 dated Signals under this heading in the Sources table, set out below newest first. [S1]")).toThrow(/housekeeping/);
    expect(() => reg.housekeeping("The record holds 4 dated Signals under this heading; the newest is a $5 billion deal.")).toThrow(/housekeeping/);
    expect(reg.housekeeping("The record holds 4 dated Signals under this heading in the Sources table, set out below newest first.")).toMatch(/^The record holds 4/);
  });
});

// ---------------------------------------------------------------------------------------------
// Decisions 3–5 / amendments 1–4, 6 — source hygiene
// ---------------------------------------------------------------------------------------------

const GOOGLE = "https://news.google.com/rss/articles/CBMiAAA?oc=5";

describe("source hygiene — isCitableSource", () => {
  it("rejects an unresolved redirect, an index page, a shared listing URL and a nameless publisher; keeps primary records", () => {
    expect(isCitableSource({ ref_kind: "signal", url: GOOGLE, source_name: "Outlet" })).toBe(false);
    expect(citabilityReason({ ref_kind: "signal", url: GOOGLE, source_name: "Outlet" })).toBe("redirect");
    expect(citabilityReason({ ref_kind: "artifact", url: "https://www.datacenterdynamics.com/en/news/?term=smr", source_name: "DCD" })).toBe("index_page");
    expect(citabilityReason({ ref_kind: "artifact", url: "https://x.example/a-real-article-slug/", source_name: "X", shared_url: true })).toBe("shared_url");
    expect(citabilityReason({ ref_kind: "artifact", url: "https://x.example/a-real-article-slug/", source_name: null })).toBe("no_source_name");
    expect(isCitableSource({ ref_kind: "artifact", url: "https://x.example/a-real-article-slug/", source_name: "X" })).toBe(true);
    expect(isCitableSource({ ref_kind: "puc", url: "https://interchange.puc.texas.gov/search/documents/?controlNumber=58481&itemNumber=219", source_name: "State utility commission docket" })).toBe(true);
  });
  it("classifies redirects, index pages and publishers; never 'Google News'", () => {
    expect(isRedirectUrl(GOOGLE)).toBe(true);
    expect(hostOf(GOOGLE)).toBeNull();
    expect(hostOf("https://www.unite.ai/x")).toBe("unite.ai");
    for (const u of ["https://www.datacenterdynamics.com/en/news/", "https://www.datacenterdynamics.com/en/news/?tag=smr", "https://www.datacenterdynamics.com/en/news/?term=ercot", "https://x.example/search?q=data+center", "https://x.example/?s=ai", "https://x.example/tag/ercot/", "https://letsdatascience.com/news/topic/data-centers", "https://x.example/category/power/", "https://x.example/archive/2026/"])
      expect(isIndexUrl(u), u).toBe(true);
    // ?s= / ?q= on an article path is tracking, not search.
    expect(isIndexUrl("https://x.example/2026/11/02/oracle-signs-big-data-center-deal/?s=rss")).toBe(false);
    expect(isIndexUrl("https://x.example/news/12345678?q=share")).toBe(false);
    expect(publisherOf('Google News search: "CoreWeave"', "CoreWeave Sees No Vote Hit - FourWeekMBA", "https://fourweekmba.com/x").publisher).toBe("FourWeekMBA");
    expect(publisherOf("Google News", "No outlet suffix here", "https://bloomingbit.io/feed/news/1").publisher).toBe("bloomingbit.io");
    expect(publisherOf("Reuters", "Headline", GOOGLE).publisher).toBe("Reuters");
    expect(publisherOf(null, "Headline", GOOGLE).publisher).toBeNull();
  });
  it("must-not-skip: ten real article URLs from the captured fixtures stay citable and reach their packs", async () => {
    const REAL = [
      "https://news.ambest.com/newscontent.aspx?refnum=275089&altsrc=23",
      "https://mississippitoday.org/2026/11/02/federal-judge-southaven-data-center-gas-turbines-must-have-air-permits/?utm_medium=rss",
      "https://datacenterpost.com/singapore-dc-cfa2-the-new-rules-of-data-centre-competition/?utm_source=rss&utm_medium=rss&utm_campaign=singapore-dc-cfa2-the-new-rules-of-data-centre-competition",
      "https://www.heise.de/news/Cloud-und-KI-Amazon-will-2027-16-Milliarden-Euro-in-Deutschland-investieren-11493822.html?wt_mc=rss.red.ho.ho.atom.beitrag.beitrag",
      "https://techcrunch.com/2026/11/08/nvidia-says-its-investigating-ceo-jensen-huangs-relationship-with-possible-chinese-spy/",
      "https://www.utilitydive.com/news/historic-election-night-wont-change-growth-focus-at-duke-energy-executi/873965/",
      "https://convergedigest.com/ai-infrastructure-stocks-networking-neocloud-selloff-october-30-2026/",
      "https://shattered.io/iren-delays-microsoft-ai-deliveries-15-billion-capex-2026/",
      "https://www.unite.ai/polar-secures-over-1b-in-2026-funding-for-ai-data-centers/",
      "https://www.cnbc.com/2026/11/05/ai-data-centers-midterms-capacity.html",
    ];
    const urls = new Set<string>();
    for (const p of SAMPLE) for (const it of (await fixture(p)).pack.items) urls.add(it.url);
    for (const u of REAL) {
      expect(isIndexUrl(u), u).toBe(false);
      expect(isRedirectUrl(u)).toBe(false);
      expect(urls.has(u), u).toBe(true);
    }
  });
  it("titles of one re-crawled article are not 'different'; two articles are", () => {
    expect(differentTitles("Due to Shortages, Oracle Delays Several Data Centers Intended for OpenAI Until 2028", "Oracle Delays Several Data Centers Intended for OpenAI Until 2028")).toBe(false);
    expect(differentTitles("Germany Says Your Data Center Has to Heat the Neighborhood. The Deadline Is July 1.", "Germany's Data Center Heat Reuse Mandate Takes Effect July 1, 2026")).toBe(false);
    expect(differentTitles("Duke Energy keeps its 15.4 GW pipeline", "SpaceX faces local opposition in Arizona")).toBe(true);
  });
});

describe("source hygiene — buildPack drops non-citable items before composition", () => {
  it("resolves a redirect to the artifact's publisher URL, drops it when there is none, skips index and shared listing URLs", () => {
    const pk = synthPack(
      [
        sig("resolved", "2026-11-05", "Oracle signed a 1 GW deal.", GOOGLE, { artifact: { source_url: "https://en.bloomingbit.io/feed/news/120551", source_name: 'Google News search: "Oracle"', title: "Oracle Signs 1 GW Deal - Bloomingbit" } }),
        sig("dropped", "2026-11-04", "CoreWeave kept a $104B backlog.", GOOGLE, { artifact: { source_url: GOOGLE, source_name: 'Google News search: "CoreWeave"' } }),
        sig("index", "2026-11-03", "Eight stories about SMRs.", "https://www.datacenterdynamics.com/en/news/?tag=smr"),
        sig("article", "2026-11-02", "Duke kept a 15.4 GW pipeline.", "https://wire.example/duke-keeps-growth-plan"),
      ],
      [
        { artifact_id: "art-g", source_url: GOOGLE, title: "X - Outlet", source_name: "Google News", summary: "A summary sentence here.", published_at: "2026-11-01T00:00:00Z" },
        { artifact_id: "l1", source_url: "https://hub.example/texas-hub", title: "Duke Energy keeps its 15.4 GW pipeline", source_name: "Hub", summary: "First listing story text.", published_at: "2026-11-01T00:00:00Z" },
        { artifact_id: "l2", source_url: "https://hub.example/texas-hub", title: "SpaceX faces local opposition in Arizona", source_name: "Hub", summary: "Second listing story text.", published_at: "2026-10-30T00:00:00Z" },
      ],
    );
    expect(pk.items.map((i: any) => i.id).sort()).toEqual(["article", "resolved"]);
    const res = pk.items.find((i: any) => i.id === "resolved");
    expect(res.url).toBe("https://en.bloomingbit.io/feed/news/120551");
    expect(res.publisher).toBe("Bloomingbit");
    expect(pk.hygiene).toMatchObject({ items_in: 7, dropped: 5, by_reason: { redirect: 2, index_page: 1, shared_url: 2, no_source_name: 0 } });
    const d = compose(threadBrief, pk, { now: NOW_T });
    expect(d.source_refs.map((r: any) => r.id).sort()).toEqual(["article", "resolved"]); // never composed, so never removed
    expect(d.meta.hygiene.dropped).toBe(5);
    expect(d.manuscript_md).toMatch(/\*\*Source hygiene\.\*\* 5 of 7 in-window records were not cited/);
  });
  it("logs items in / dropped by reason per brief, and a WARNING line above 30 %", () => {
    const log = vi.fn();
    synthPack(
      [
        sig("ok", "2026-11-05", "Duke kept a 15.4 GW pipeline.", "https://wire.example/duke-keeps-growth-plan"),
        sig("g1", "2026-11-04", "Text one here.", GOOGLE, { artifact: { source_url: GOOGLE } }),
      ],
      [],
      { log },
    );
    const lines = log.mock.calls.map((c) => c[0]);
    expect(lines[0]).toMatch(/^\[evidence\] synth-00 "Hyperscale Capex": items in 2, dropped 1 \(50%\) — redirect 1 · index_page 0 · shared_url 0 · no_source_name 0$/);
    expect(lines[1]).toMatch(/^\[evidence\] WARNING synth-00: 50% of the in-window evidence was dropped/);
  });
  it("no fixture draft cites a redirect, an index page or 'Google News'; overall drop share is reported", async () => {
    let inAll = 0;
    let dropAll = 0;
    for (const p of SAMPLE) {
      const { b, now, pack: pk } = await fixture(p);
      inAll += pk.hygiene.items_in;
      dropAll += pk.hygiene.dropped;
      const d = compose(b, pk, { now });
      for (const r of d.source_refs) {
        expect(isRedirectUrl(r.url)).toBe(false);
        expect(String(r.publisher ?? "")).not.toMatch(/google news/i);
        if (r.kind === "signal" || r.kind === "artifact" || r.kind === "facility") expect(isIndexUrl(r.url)).toBe(false);
      }
      expect(d.manuscript_md).not.toMatch(/· Google News\*/);
    }
    // BL3-07 (FDY-331): 23 Texas JW events captured without observed_at/triggered_at are undated and leave
    // the window before the citability count (819 in-window before BL3-07).
    expect(inAll).toBe(796);
    expect(dropAll).toBe(177); // 22.2 % of in-window records across the seven captured packs
    const { pack: tx } = await fixture("fx000800");
    expect(tx.items.some((i: any) => i.ref_kind === "puc" && /\/search\//.test(i.url))).toBe(true); // docket records are not index pages
  });
});

describe("source hygiene — vendor / sponsored sources are flagged, labelled, never dropped (amendment 6)", () => {
  it("flags press wires, press rooms, sponsored content and the subject's own site", () => {
    expect(isVendorOrSponsored({ url: "https://prnewswire.com/news-releases/2026-data-center-announcements-302929189.html" })).toBe(true);
    expect(isVendorOrSponsored({ url: "https://www.vertiv.com/en-us/about/news-and-insights/newsroom/press-releases/2026/x/" })).toBe(true);
    expect(isVendorOrSponsored({ url: "https://wire.example/some-article-here", title: "Sponsored: the future of cooling" })).toBe(true);
    expect(isVendorOrSponsored({ url: "https://investors.coreweave.com/news/x" }, "coreweave.com")).toBe(true);
    expect(isVendorOrSponsored({ url: "https://www.utilitydive.com/news/duke/873965/" }, "coreweave.com")).toBe(false);
  });
  it("carries vendor_or_sponsored on the ref and labels the Sources table row", () => {
    const pk = synthPack([
      sig("pr", "2026-11-06", "A vendor announced a 50 MW cooling order.", "https://www.globenewswire.com/news-release/2026/11/06/1/0/en/vendor-announces-cooling-order.html"),
      sig("news", "2026-11-05", "Duke kept a 15.4 GW pipeline.", "https://wire.example/duke-keeps-growth-plan"),
    ]);
    expect(pk.items.map((i: any) => i.id).sort()).toEqual(["news", "pr"]);
    const d = compose(threadBrief, pk, { now: NOW_T });
    const pr = d.source_refs.find((r: any) => r.id === "pr")!;
    expect(pr.vendor_or_sponsored).toBe(true);
    expect(d.source_refs.find((r: any) => r.id === "news")!.vendor_or_sponsored).toBe(false);
    expect(d.manuscript_md).toMatch(new RegExp(`\\| ${pr.ref} \\| \\[[^\\n]*\\| Example Wire \\(vendor/sponsored\\) \\|`));
  });
});

// ---------------------------------------------------------------------------------------------
// G1 — parsing fix and the new named checks
// ---------------------------------------------------------------------------------------------

describe("G1 — markers after a sentence end, and the BL3-06 checks", () => {
  it("synthetic (FDY-306 Japan case, same class as Germany/Polar): a marker after a sentence end belongs to that sentence", () => {
    const units = unitsOf("Japan's METI set a 2030 target for data center efficiency. [S3] SoftBank secured over ¥1B in 2026 funding from H.I.G. Capital and two banks. [S2]");
    expect(units.map((u: any) => u.cites)).toEqual([[3], [2]]);
    expect(units[1].text).toMatch(/^SoftBank secured over ¥1B .* two banks\. \[S2\]$/);
    const u2 = unitsOf("A first fact was recorded. [S1] 47 major U.S. utilities filed plans. [S2]");
    expect(u2.map((u: any) => [u.text, u.cites])).toEqual([
      ["A first fact was recorded. [S1]", [1]],
      ["47 major U.S. utilities filed plans. [S2]", [2]],
    ]);
  });
  it("checkSourceHygiene flags redirects, index/listing pages and a 'Google News' publisher", () => {
    const out: any[] = [];
    const push = (code: string, message: string, extra = {}) => out.push({ code, message, ...extra });
    checkSourceHygiene(
      [
        { ref: "S1", url: GOOGLE, title: "A", kind: "signal", publisher: "Google News" },
        { ref: "S2", url: "https://www.datacenterdynamics.com/en/news/?term=x", title: "B", kind: "artifact", publisher: "DCD" },
        { ref: "S3", url: "https://hub.example/hub", title: "Duke Energy keeps its 15.4 GW pipeline", kind: "artifact", publisher: "Hub" },
        { ref: "S4", url: "https://hub.example/hub", title: "SpaceX faces local opposition in Arizona", kind: "artifact", publisher: "Hub" },
        { ref: "S5", url: "https://interchange.puc.texas.gov/search/documents/?controlNumber=1", title: "Docket", kind: "puc", publisher: "PUC" },
        { ref: "S6", url: "https://wire.example/a-real-article-slug/", title: "Fine", kind: "signal", publisher: "Wire" },
        { ref: "S7", url: "https://news.ambest.com/newscontent.aspx?refnum=275089&altsrc=23", title: "Insurer names a new chief risk officer", kind: "artifact", publisher: "AM Best" },
        { ref: "S8", url: "https://news.ambest.com/newscontent.aspx?refnum=275090&altsrc=23", title: "Reinsurer exits data center construction cover", kind: "artifact", publisher: "AM Best" },
      ],
      push,
    );
    expect(out.map((o) => `${o.code}:${o.marker}`).sort()).toEqual(["publisher_google_news:1", "source_index_page:2", "source_index_page:3", "source_index_page:4", "source_redirect:1"]);
  });
  it("checkHousekeepingMarkers flags an old-style housekeeping line that carries a marker", () => {
    const out: any[] = [];
    const md = "## A\n\nThe record holds 5 dated Signals under this heading in the window; the newest is Fund Closes $9B Vehicle [S2]\n\n## B\n\nThe record holds 3 dated Signals under this heading in the Sources table, set out below newest first.\n";
    checkHousekeepingMarkers(parseManuscript(md), (code: string, message: string, extra = {}) => out.push({ code, ...extra }));
    expect(out).toEqual([{ code: "housekeeping_cited", section: "A", markers: [2] }]);
  });
  it("0 number_mismatch, 0 source_unresolved and no BL3-06 blocker on freshly composed drafts for all seven fixture packs", async () => {
    for (const p of SAMPLE) {
      const { b, now, pack: pk } = await fixture(p);
      const d = compose(b, pk, { now });
      const r = runG1({ draft: { ...d, briefing_type: b.briefing_type }, briefing: b, pages: PAGES_OK[b.tier], resolve: packResolver(pk) });
      const codes = r.blockers.map((x: any) => x.code);
      expect(codes, p).toEqual([]);
      expect(r.stats.numbers_checked).toBeGreaterThan(0);
    }
  });
});
