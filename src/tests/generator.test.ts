import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPack,
  completeSentences,
  createFixtureEvidence,
  evidenceWindow,
  extractFigures,
  fullText,
  sentences,
  splitOutlet,
} from "../../scripts/lanes/evidence.mjs";
import { compose, splitSections, validate, numbersSupported, BYLINES, PAGE_RANGE, PROFILE_THIN_BELOW, PROFILE_MAX_SIGNALS } from "../../scripts/lanes/compose.mjs";
import { generate, nextBudget } from "../../scripts/lanes/generate.mjs";
import { parseManuscript, renderManuscript, countPdfPages, inRange } from "../../scripts/templates/manuscript.mjs";
import { EVIDENCE_FIXTURES_DIR, FIXTURES_DIR } from "../../scripts/lanes/run.mjs";

const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
const brief = (prefix: string) => briefs.find((b) => b.id.startsWith(prefix));
async function pack(prefix: string) {
  const b = brief(prefix);
  const raw = await evidence.fetchRaw(b);
  const now = new Date(raw.captured_at);
  return { b, now, pack: buildPack(raw, b, evidenceWindow(b, now)) };
}
const SAMPLE = ["fx000100", "fx000300", "fx000500", "fx000600", "fx000700", "fx000800", "fx000900"];

describe("evidence — text helpers", () => {
  it("splits sentences without breaking abbreviations and keeps only complete clauses", () => {
    expect(sentences("The U.S. grid grew. ERCOT added 2.7 GW. Inc. filed")).toEqual(["The U.S. grid grew.", "ERCOT added 2.7 GW.", "Inc. filed"]);
    expect(completeSentences("First sentence. Second is cut mid")).toEqual(["First sentence."]);
    expect(completeSentences("")).toEqual([]);
  });
  it("prefers the full faradays_take when framing is the 240-char truncation of it", () => {
    const framing = "A".repeat(100) + " continues and then is cut";
    const take = framing + " off at the end. And more.";
    expect(fullText({ framing, faradays_take: take })).toBe(take);
    expect(fullText({ framing: "Short.", faradays_take: "Different text." })).toBe("Short.");
  });
  it("recognises a Google News outlet suffix only when it looks like an outlet", () => {
    expect(splitOutlet("CoreWeave Sees No Vote Hit - FourWeekMBA")).toEqual({ headline: "CoreWeave Sees No Vote Hit", outlet: "FourWeekMBA" });
    expect(splitOutlet("Data Center Energy Industry Update – Houston, TX (November 2, 2026)").outlet).toBeNull();
  });
  it("extracts stated figures", () => {
    expect(extractFigures("CoreWeave reports a $104B backlog with 2.7 GW not yet live and 18% growth")).toEqual(["$104B", "2.7 GW", "18%"]);
  });
  it("windows follow the tier, and jurisdiction briefs always take 12 months", () => {
    const now = new Date("2026-11-09T15:04:00Z");
    expect(evidenceWindow({ tier: "standard" }, now).months).toBe(6);
    expect(evidenceWindow({ tier: "standard", briefing_type: "jurisdiction" }, now).months).toBe(12);
    expect(evidenceWindow({ tier: "profile" }, now).from.toISOString()).toBe("2025-11-09T15:04:00.000Z");
    expect(() => evidenceWindow({ tier: "brief" }, now)).toThrow(/unknown tier/);
  });
});

describe("evidence — packs from captured Faraday records", () => {
  it("normalises every fixture pack: items are in-window, de-duplicated by URL, newest first, with complete clauses", async () => {
    for (const p of SAMPLE) {
      const { pack: pk } = await pack(p);
      expect(pk.items.length).toBeGreaterThan(5);
      const urls = pk.items.map((i: any) => i.url);
      expect(new Set(urls).size).toBe(urls.length);
      for (const it of pk.items) {
        expect(it.url).toMatch(/^https?:\/\//);
        expect(it.text.length).toBeGreaterThan(0);
        expect(it.date >= pk.window.from && it.date <= pk.window.to).toBe(true);
        for (const s of it.text) expect(s).toMatch(/[.!?…]["')\]]?$/);
      }
      for (let i = 1; i < pk.items.length; i += 1) expect(pk.items[i - 1].date >= pk.items[i].date).toBe(true);
    }
  });
  it("jurisdiction packs carry the Jurisdiction Watch posture record and JW-table items with distinct citable URLs", async () => {
    const { pack: tx } = await pack("fx000800");
    expect(tx.jurisdiction_record?.text[0]).toMatch(/Jurisdiction Watch records Texas's current posture as Leading/);
    const kinds = new Set(tx.items.map((i: any) => i.ref_kind));
    expect(kinds.has("moratorium")).toBe(true);
    expect(kinds.has("puc")).toBe(true);
    expect(kinds.has("jw_event")).toBe(true);
    const mor = tx.items.filter((i: any) => i.ref_kind === "moratorium");
    expect(new Set(mor.map((m: any) => m.url)).size).toBe(mor.length);
    expect(mor[0].attribution).toMatch(/Moratorium Nation .* CC-BY-4\.0/);
  });
  it("entity records come from the companies / institutions rows", async () => {
    const { pack: cw } = await pack("fx000600");
    expect(cw.entity?.name).toBe("CoreWeave");
    expect(cw.entity?.identity.map((k: any) => k.label)).toContain("Ticker");
    const { pack: erc } = await pack("fx000700");
    expect(erc.entity?.identity[0]).toEqual({ label: "Institution type", value: "Regulator" });
  });
});

describe("composer — every tier, every rule", () => {
  it("produces a valid draft for all seven fixture briefs: 100% marker↔source_refs parity, cited prose, public vocabulary", async () => {
    for (const p of SAMPLE) {
      const { b, now, pack: pk } = await pack(p);
      const d = compose(b, pk, { now });
      const v = validate(d);
      expect(v.problems).toEqual([]);
      expect(v.markers).toBe(d.source_refs.length);
      for (const r of d.source_refs) {
        expect(r.url).toBeTruthy();
        expect(r.title).toBeTruthy();
        expect(r.kind).toBeTruthy();
        expect(r.id).toBeTruthy();
      }
      expect(d.manuscript_md).not.toMatch(/Key Player/i);
      const body = d.manuscript_md.split(/## Sources & method/)[0];
      expect(body).not.toMatch(/\b(?:Theme|Domain|Sub-?Domain)s?\b/);
      expect(d.contents.length).toBeGreaterThan(3);
      expect(d.contents.join("\n\n").trim()).toBe(d.manuscript_md.trim());
    }
  });
  it("Deep (theater): editorial byline, Summary → 4–7 Sector sections → Signals to watch → Take → Sources, generic media Threads excluded", async () => {
    const { b, now, pack: pk } = await pack("fx000100");
    const d = compose(b, pk, { now });
    expect(d.byline).toBe(BYLINES.deep);
    const heads = d.manuscript_md.match(/^## .*$/gm)!;
    expect(heads[0]).toBe("## Summary");
    const body = heads.filter((h) => /^## \d+\. /.test(h));
    expect(body.length).toBeGreaterThanOrEqual(4);
    expect(body.length).toBeLessThanOrEqual(7);
    expect(heads).toContain("## Signals to watch");
    expect(heads).toContain("## Faraday's Take");
    expect(heads.at(-1)).toBe("## Sources & methodology");
    expect(d.manuscript_md).not.toMatch(/## \d+\. Industry Media/);
    expect(d.manuscript_md).toMatch(/\*— Faraday Editorial\*/);
  });
  it("Standard (sector/thread): Gilbert byline, argument + at-a-glance, Thread sections, Signal register, Take, Sources", async () => {
    for (const p of ["fx000300", "fx000500"]) {
      const { b, now, pack: pk } = await pack(p);
      const d = compose(b, pk, { now });
      expect(d.byline).toBe("Gilbert Faraday");
      const heads = d.manuscript_md.match(/^## .*$/gm)!;
      expect(heads[0]).toBe("## The argument");
      expect(heads).toContain("## Signal register");
      expect(heads).toContain("## Faraday's Take");
      expect(heads.at(-1)).toBe("## Sources & methodology");
      expect(d.manuscript_md).toMatch(/\*\*At a glance\*\*/);
    }
  });
  it("Jurisdiction: the six fixed headings in order, posture record first, legal-advice line in the method note, CC-BY attribution kept", async () => {
    const { b, now, pack: pk } = await pack("fx000800");
    const d = compose(b, pk, { now });
    const heads = d.manuscript_md.match(/^## .*$/gm)!;
    expect(heads.slice(1, 7)).toEqual(["## Legislation & rules", "## Permitting & siting", "## Power & utility regulation", "## Incentives & tax", "## Water/environment", "## Signals to watch"]);
    expect(d.hypothesis).toMatch(/^Jurisdiction Watch records Texas's current posture/);
    expect(d.manuscript_md).toMatch(/\nInformational, not legal advice\.\n/);
    // The CC-BY attribution rides with the data: present exactly when a Moratorium Nation record is cited.
    const wide = compose(b, { ...pk, items: pk.items.filter((i: any) => i.ref_kind === "moratorium" || i.ref_kind === "record").concat(pk.items.filter((i: any) => i.ref_kind === "signal").slice(0, 10)) }, { now });
    expect(wide.manuscript_md).toMatch(/Moratorium Nation \(CC-BY-4\.0\)\*/);
    expect(wide.manuscript_md).toMatch(/Data: Moratorium Nation \(mjbommar\) — CC-BY-4\.0/);
    expect(/Moratorium Nation \(CC-BY-4\.0\)\*/.test(d.manuscript_md)).toBe(/Data: Moratorium Nation \(mjbommar\)/.test(d.manuscript_md));
    expect(d.byline).toBe("Gilbert Faraday");
    const { b: de, now: n2, pack: dePack } = await pack("fx000900");
    const g = compose(de, dePack, { now: n2 });
    expect(g.manuscript_md.match(/^## .*$/gm)!.slice(1, 7)).toHaveLength(6);
    expect(g.manuscript_md).toMatch(/The record holds no dated Signal for this heading in the window\./); // an empty heading is stated, never padded
  });
  it("Profile: no byline, no Take, no CTA, no rating, ≤ 8 Signals, identity card cited to the entity record", async () => {
    for (const p of ["fx000600", "fx000700"]) {
      const { b, now, pack: pk } = await pack(p);
      const d = compose(b, pk, { now });
      expect(d.byline).toBeNull();
      expect(d.manuscript_md).not.toMatch(/Faraday's Take/);
      expect(d.manuscript_md).not.toMatch(/subscribe|contact us|book a|buy now/i);
      expect(d.manuscript_md.match(/^## .*$/gm)).toEqual(["## Identity card", "## What the record shows", "## Dated Signals", "## Sources & method"]); // no Take, no rating, no forecast section
      expect((d.manuscript_md.match(/^### /gm) ?? []).length).toBeLessThanOrEqual(PROFILE_MAX_SIGNALS);
      expect(d.manuscript_md).toMatch(/- \*\*Company type:\*\* .* \[S1\]/);
      expect(d.source_refs[0].kind).toBe("record");
      expect(d.meta.thin).toBe(false);
    }
  });
  it("Profile thin flag follows the record (< 6 sourced Signals), not the page budget", async () => {
    const { b, now, pack: pk } = await pack("fx000600");
    const thinPack = { ...pk, items: pk.items.slice(0, 4) };
    const d = compose(b, thinPack, { now });
    expect(d.meta.thin).toBe(true);
    expect(d.meta.signal_count).toBe(4);
    expect(d.manuscript_md).toMatch(/\*\*Thin record\.\*\* Fewer than 6 sourced Signals \(4\)/);
    const cut = compose(b, pk, { now, budget: { perSection: 4 } });
    expect(cut.meta.thin).toBe(false);
    expect(PROFILE_THIN_BELOW).toBe(6);
  });
  it("validate() rejects an uncited factual sentence, an unknown marker and the forbidden term", () => {
    const base = { manuscript_md: "## X\n\nSomething factual happened in the market last year. [S1]\n\n## Sources & methodology\n", source_refs: [{ ref: "S1", url: "https://a", title: "t" }] };
    expect(validate(base).ok).toBe(true);
    expect(validate({ ...base, manuscript_md: base.manuscript_md.replace(" [S1]", "") }).problems[0]).toMatch(/never cited|uncited/);
    expect(validate({ ...base, manuscript_md: base.manuscript_md.replace("[S1]", "[S1] [S2]") }).problems).toContainEqual(expect.stringMatching(/S2 has no source_refs/));
    expect(validate({ ...base, manuscript_md: base.manuscript_md.replace("market", "Key Player") }).problems).toContainEqual(expect.stringMatching(/Key Player/));
    expect(validate({ ...base, manuscript_md: base.manuscript_md.replace("market", "D3.1 Thread") }).problems).toContainEqual(expect.stringMatching(/internal code/));
  });
  it("numbersSupported() only accepts figures present in the cited evidence", () => {
    const items = [{ text: ["CoreWeave reports a $104B backlog with 2.7 GW not yet live."] }];
    expect(numbersSupported("The backlog stands at $104B and 2.7 GW is not live.", items)).toBe(true);
    expect(numbersSupported("The backlog stands at $110B.", items)).toBe(false);
  });
  it("splitSections keeps the cover and Take blocks whole", () => {
    const md = ":::cover\n# T\n\nDeck.\n:::\n\n## A\n\nx\n\n:::take\n## Faraday's Take\n\ny\n:::\n\n## Sources & methodology\n\nz\n";
    const parts = splitSections(md);
    expect(parts.map((p) => p.split("\n")[0])).toEqual([":::cover", "## A", ":::take", "## Sources & methodology"]);
  });
});

describe("generator — fit loop and contract", () => {
  it("nextBudget shrinks sentences before entries, grows only when the record has more, and respects the Profile floor", () => {
    const sections = [{ total: 20, items: 6 }];
    expect(nextBudget({ perSection: 6, sentences: 3, maxSections: 5, minSections: 3 }, 14, "standard", { meta: { sections } })).toMatchObject({ sentences: 2 });
    expect(nextBudget({ perSection: 6, sentences: 2, maxSections: 5, minSections: 3 }, 14, "standard", { meta: { sections } })).toMatchObject({ perSection: 4 });
    expect(nextBudget({ perSection: 6, sentences: 3, maxSections: 5, minSections: 3 }, 6, "standard", { meta: { sections } }).perSection).toBeGreaterThan(6);
    expect(nextBudget({ perSection: 6, sentences: 4, maxSections: 5, minSections: 3 }, 6, "standard", { meta: { sections: [{ total: 6, items: 6 }] } })).toBeNull();
    expect(nextBudget({ perSection: 8, sentences: 2, lead: 2 }, 3, "profile", {})).toMatchObject({ lead: 1 });
    expect(nextBudget({ perSection: 4, sentences: 1, lead: 1 }, 3, "profile", {})).toBeNull();
    expect(nextBudget({ perSection: 8, sentences: 2, lead: 2 }, 1, "profile", {})).toBeNull();
  });
  it("generate() without a page counter returns the full contract from fixture evidence", async () => {
    const g = await generate(brief("fx000600"), { evidence });
    expect(g.stub).toBe(false);
    expect(g.render_checked).toBe(false);
    expect(g.pages).toBeNull();
    expect(g.byline).toBeNull();
    expect(g.source_refs.length).toBe(g.source_count);
    expect(g.manuscript_md).toMatch(/^:::cover/);
    expect(g.contents[0]).toMatch(/^:::cover/);
    expect(g.evidence_to.slice(0, 10)).toBe("2026-11-09"); // fixture packs draft as of their capture
    expect(g.evidence_from.slice(0, 10)).toBe("2025-11-09");
    expect(g.polish_reason).toBe("polish disabled");
  });
  it("generate() with a fake counter re-composes until the page range is met and reports the fit", async () => {
    // A counter that reports "too long" until the entry budget is small enough.
    const counter = { async count(html: string) { return { pages: html.length > 60000 ? 12 : 9, fontsLoaded: 0 }; } };
    const g = await generate(brief("fx000300"), { evidence, counter });
    expect(g.render_checked).toBe(true);
    expect(g.fit.length).toBeGreaterThanOrEqual(1);
    expect(g.in_range).toBe(inRange(g.pages, "standard"));
    expect(PAGE_RANGE.standard).toEqual([8, 10]);
  });
  it("generate() rejects unknown tiers and a missing evidence source", async () => {
    await expect(generate({ tier: "brief" }, { evidence })).rejects.toThrow(/unknown tier/);
    await expect(generate(brief("fx000600"), {})).rejects.toThrow(/evidence source/);
  });
});

describe("manuscript renderer", () => {
  it("parses cover, parts, entries and the Take, and renders every tier to HTML with resolvable citations", async () => {
    for (const p of SAMPLE) {
      const { b, now, pack: pk } = await pack(p);
      const d = compose(b, pk, { now });
      const doc = parseManuscript(d.manuscript_md);
      expect(doc.cover?.title).toBe(d.title);
      expect((doc.parts as any[]).every((x) => x.heading)).toBe(true);
      expect(doc.json).toBeTruthy();
      expect(JSON.parse(doc.json!).length).toBe(d.source_refs.length);
      const html = renderManuscript(d.manuscript_md, b.tier);
      expect(html).toContain("<title>");
      for (const r of d.source_refs) {
        expect(html).toContain(`id="src-${r.ref}"`);
        expect(html).toContain(`href="#src-${r.ref}"`);
      }
      if (b.tier === "profile") expect(html).not.toMatch(/class="take"/);
      else expect(html).toMatch(/class="take"/);
      if (b.tier === "deep") expect(html).toContain("Deep brief");
    }
  });
  it("counts PDF pages from /Type /Page objects", () => {
    expect(countPdfPages(Buffer.from("x /Type /Pages y /Type /Page z /Type/Page"))).toBe(2);
  });
});
