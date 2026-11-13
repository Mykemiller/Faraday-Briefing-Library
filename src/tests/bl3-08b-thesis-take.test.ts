// BL3-08b (FDY-333b): thesis + Take written by the model and VERIFIED IN CODE.
// Every model call here goes through a STUB client — no key, no network. The fixture packs are real
// captured production records; the thesis/Take text the stub returns is synthetic, so the rates reported
// in the PR describe the gate's plumbing on the fixtures, not the quality of a real model.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildPack, createFixtureEvidence, evidenceWindow } from "../../scripts/lanes/evidence.mjs";
import { compose } from "../../scripts/lanes/compose.mjs";
import { generate } from "../../scripts/lanes/generate.mjs";
import { NoThesisError, TAKE_LABEL, applyThesis, bodySentences, createThesisWriter, entitiesIn, readThesisMeta, tokenOverlap, verifyThesis } from "../../scripts/lanes/thesis.mjs";
import { checkThesisMissing, runG1 } from "../../scripts/review/g1.mjs";
import { EVIDENCE_FIXTURES_DIR, FIXTURES_DIR, runLane, createFixtureDb, loadFixtures } from "../../scripts/lanes/run.mjs";
import { createStatusLog } from "../../scripts/statuslog.mjs";

const briefs: any[] = JSON.parse(readFileSync(`${FIXTURES_DIR}/briefings.json`, "utf8"));
const evidence = createFixtureEvidence(EVIDENCE_FIXTURES_DIR);
const quiet = { log: null };

/** A small hand-built draft + pack so each verification rule can be hit on its own. */
const pack: any = {
  items: [
    { url: "https://a.example/1", ref_kind: "signal", headline: "Duke Energy reaffirms its 15.4 GW pipeline", publisher: "Utility Dive", date: "2026-11-01", text: ["Duke Energy has up to $600M earmarked for grid upgrades and a 15.4 GW large-load pipeline."] },
    { url: "https://b.example/2", ref_kind: "signal", headline: "Texas moratorium extended", publisher: "Texas Tribune", date: "2026-10-20", text: ["Texas extended its construction moratorium through mid-2027."] },
  ],
};
const draft: any = {
  title: "Grid watch", tier: "standard", kind: "standard", byline: "Gilbert Faraday",
  source_refs: [{ ref: "S1", url: "https://a.example/1", title: "A" }, { ref: "S2", url: "https://b.example/2", title: "B" }],
  hypothesis: "old",
  manuscript_md: ":::cover\n# Grid watch\n\nOld deck. [S1]\n\n- **Tier:** Standard\n:::\n\n## The argument\n\nDuke Energy has up to $600M earmarked for grid upgrades and a 15.4 GW large-load pipeline. [S1]\n\nTexas extended its construction moratorium through mid-2027. [S2]\n\n:::take\n## Faraday's Take\n\nold take [S1]\n\n*— Gilbert Faraday*\n:::\n\n## Sources & methodology\n\n| Ref |\n|---|\n",
};
const GOOD_THESIS = "Expect utilities to keep funding grid upgrades while moratoria slow siting. [S1] [S2]";
const GOOD_TAKE = ["Our view is that the weight of the record matters more than any single headline.", "Operators should plan for slower siting in Texas even as upgrades continue. [S2]"];

describe("verifyThesis — each rule on its own (synthetic)", () => {
  it("accepts a one-sentence cited thesis with a Take that takes a position", () => {
    expect(verifyThesis(GOOD_THESIS, GOOD_TAKE, draft, pack)).toEqual([]);
  });
  it("rejects a multi-sentence, uncited or over-long thesis", () => {
    expect(verifyThesis("Utilities spend. Moratoria bite. [S1]", GOOD_TAKE, draft, pack).join()).toMatch(/one sentence/);
    expect(verifyThesis("Utilities will keep spending.", GOOD_TAKE, draft, pack).join()).toMatch(/no marker|uncited/);
    expect(verifyThesis(`${"word ".repeat(50)}will end. [S1]`, GOOD_TAKE, draft, pack).join()).toMatch(/max 45/);
  });
  it("rejects a number or an entity no cited item states", () => {
    expect(verifyThesis("Expect Duke Energy to spend 99 GW on grid upgrades. [S1]", GOOD_TAKE, draft, pack).join()).toMatch(/unsupported number/);
    expect(verifyThesis("Expect Dominion Energy to lead grid upgrades. [S1]", GOOD_TAKE, draft, pack).join()).toMatch(/names "Dominion Energy"/);
  });
  it("rejects a dropped hedge (up to $600M → $600M)", () => {
    expect(verifyThesis("Expect Duke Energy to deploy $600M on grid upgrades. [S1]", GOOD_TAKE, draft, pack).join()).toMatch(/qualifier_changed/);
    expect(verifyThesis("Expect Duke Energy to deploy up to $600M on grid upgrades. [S1]", GOOD_TAKE, draft, pack)).toEqual([]);
  });
  it("rejects a Take with no position verb, no marker, or that restates a body sentence", () => {
    expect(verifyThesis(GOOD_THESIS, ["Our view is that the record is large.", "Siting is hard in Texas. [S2]"], draft, pack).join()).toMatch(/takes no position/);
    expect(verifyThesis(GOOD_THESIS, ["Our view is that operators should be careful.", "Operators will adapt."], draft, pack).join()).toMatch(/take carries no marker/);
    expect(verifyThesis(GOOD_THESIS, ["Texas extended its construction moratorium through mid-2027 so operators should plan. [S2]"], draft, pack).join()).toMatch(/restates a body sentence/);
  });
  it("helpers: overlap, entities, body sentences", () => {
    expect(tokenOverlap("Texas extended its construction moratorium", "Texas extended its construction moratorium through mid-2027.")).toBe(1);
    expect(entitiesIn("Expect Duke Energy and Texas to move. [S1]")).toEqual(["Duke Energy", "Texas"]);
    expect(bodySentences(draft.manuscript_md).join(" ")).not.toMatch(/old take|Old deck/);
  });
});

function stubClient(replies: Array<string | Error>) {
  const create = vi.fn(async (_args: any) => {
    const r = replies.shift();
    if (r instanceof Error) throw r;
    return { stop_reason: "end_turn", content: [{ type: "text", text: r ?? "" }] };
  });
  return { client: { messages: { create } } as any, create };
}
const reply = (thesis: string | null, take: string[] = GOOD_TAKE) => JSON.stringify(thesis == null ? { thesis: null, reason: "evidence is thin" } : { thesis, take });

describe("createThesisWriter (stub client)", () => {
  it("is null without a key or client, so the gate fails closed", () => {
    expect(createThesisWriter({ apiKey: "" })).toBeNull();
    expect(createThesisWriter({ enabled: false, client: {} as any })).toBeNull();
  });
  it("calls the model at temperature 0 and returns the verified thesis + Take with the model id", async () => {
    const { client, create } = stubClient([reply(GOOD_THESIS)]);
    const w = createThesisWriter({ client, model: "stub-model" })!;
    const r: any = await w.write(draft, pack);
    expect(r).toMatchObject({ ok: true, thesis: GOOD_THESIS, label: TAKE_LABEL, model: "stub-model", attempts: 1 });
    expect(create.mock.calls[0][0]).toMatchObject({ temperature: 0, model: "stub-model" });
  });
  it("retries ONCE with the problems fed back, then accepts", async () => {
    const { client, create } = stubClient([reply("Expect Dominion Energy to lead. [S1]"), reply(GOOD_THESIS)]);
    const r: any = await createThesisWriter({ client })!.write(draft, pack);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[0].content).toMatch(/rejected for: .*Dominion Energy/);
  });
  it("two failed verifications ⇒ not ok (never a third call)", async () => {
    const { client, create } = stubClient([reply("Expect Dominion Energy to lead. [S1]"), reply("Expect Dominion Energy to lead. [S1]"), reply(GOOD_THESIS)]);
    const r: any = await createThesisWriter({ client })!.write(draft, pack);
    expect(r).toMatchObject({ ok: false, attempts: 2 });
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("a failing call retries once; a model that finds no thesis stops at once with its reason", async () => {
    const a = stubClient([new Error("boom"), reply(GOOD_THESIS)]);
    expect(((await createThesisWriter({ client: a.client })!.write(draft, pack)) as any).ok).toBe(true);
    const b = stubClient([reply(null)]);
    const r: any = await createThesisWriter({ client: b.client })!.write(draft, pack);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no supportable thesis: evidence is thin/);
    expect(b.create).toHaveBeenCalledTimes(1);
  });
});

/** A stub whose thesis/Take are safe for ANY fixture pack: no numbers, no names, markers from the evidence it was sent. */
function universalStub() {
  const create = vi.fn(async ({ messages }: any) => {
    const marks = [...String(messages[0].content).matchAll(/^\[(S\d+)\]/gm)].map((m) => m[1]);
    const a = marks[0], b = marks[1] ?? marks[0];
    return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ thesis: `The record points one way, so expect the cited Signals to keep compounding. [${a}]`, take: ["Our view is that the weight of the record matters more than any single headline.", `Buyers should plan around the first cited Signal before the rest of the record settles. [${b}]`] }) }] };
  });
  return { messages: { create } } as any;
}

describe("generate() with the thesis gate", () => {
  const brief = (p: string) => briefs.find((x) => x.id.startsWith(p));
  it("no writer ⇒ NoThesisError (no_thesis); nothing is returned to stage", async () => {
    await expect(generate(brief("fx000800"), { evidence, requireThesis: true })).rejects.toMatchObject({ code: "no_thesis", name: "NoThesisError" });
    await expect(generate(brief("fx000800"), { evidence, requireThesis: true })).rejects.toBeInstanceOf(NoThesisError);
  });
  it("a writer whose thesis fails verification ⇒ no_thesis, with the reason", async () => {
    const writer = createThesisWriter({ client: stubClient([reply("Expect Dominion Energy to lead. [S1]"), reply("Expect Dominion Energy to lead. [S1]")]).client })!;
    await expect(generate(brief("fx000800"), { evidence, requireThesis: true, thesisWriter: writer })).rejects.toMatchObject({ code: "no_thesis" });
  });
  it("Profiles are exempt; the gate off keeps the deterministic path", async () => {
    const profile = briefs.find((b: any) => b.tier === "profile");
    if (profile) expect((await generate(profile, { evidence, requireThesis: true })).stub).toBe(false);
    expect((await generate(brief("fx000800"), { evidence })).thesis).toBeNull();
  });
  it("every Deep/Standard fixture stages a thesis + Take with a position, the model id and a G1 pass on thesis_missing", async () => {
    const rates = { staged: 0, no_thesis: 0, watch_empty: 0 };
    for (const b of briefs.filter((x: any) => x.tier !== "profile" && ["fx000100", "fx000300", "fx000500", "fx000600", "fx000700", "fx000800", "fx000900"].some((p) => x.id.startsWith(p)))) {
      const writer = createThesisWriter({ client: universalStub(), model: "stub-model" })!;
      let gen: any;
      try {
        gen = await generate(b, { evidence, requireThesis: true, thesisWriter: writer });
      } catch (e: any) {
        if (e.code === "no_thesis") { rates.no_thesis += 1; continue; }
        throw e;
      }
      rates.staged += 1;
      if (gen.watch?.empty) rates.watch_empty += 1;
      expect(gen.thesis.model).toBe("stub-model");
      expect(gen.hypothesis).toBe(gen.thesis.text);
      expect(gen.manuscript_md).toContain(`**${TAKE_LABEL}.**`);
      const meta = readThesisMeta(gen.manuscript_md)!;
      expect(meta.model).toBe("stub-model");
      expect(meta.thesis).toBe(gen.thesis.text);
      const out: any[] = [];
      checkThesisMissing(gen.manuscript_md, b.tier, (code: string) => out.push(code));
      expect(out).toEqual([]);
    }
    expect(rates.staged).toBeGreaterThan(0);
    expect(rates.staged + rates.no_thesis).toBeGreaterThan(0);
    console.log("fixture rates (stub model):", JSON.stringify(rates));
  });
});

describe("G1 thesis_missing", () => {
  const md = (extra = "") => `:::cover\n# T\n\nThe thesis stands. [S1]\n:::\n\n## A\n\nx [S1]\n\n## Sources & methodology\n\n${extra}`;
  it("blocks a Deep/Standard draft without a thesis record, exempts Profiles, checks model id and print", () => {
    const run = (m: string, tier: string) => { const o: string[] = []; checkThesisMissing(m, tier, (c: string) => o.push(c)); return o; };
    expect(run(md(), "standard")).toEqual(["thesis_missing"]);
    expect(run(md(), "deep")).toEqual(["thesis_missing"]);
    expect(run(md(), "profile")).toEqual([]);
    const rec = (o: any) => `${md()}\n<!-- bl3-08 ${JSON.stringify(o)} -->\n`;
    expect(run(rec({ thesis: "The thesis stands.", model: "m" }), "standard")).toEqual([]);
    expect(run(rec({ thesis: "The thesis stands." }), "standard")).toEqual(["thesis_missing"]);
    expect(run(rec({ thesis: "Some other thesis.", model: "m" }), "standard")).toEqual(["thesis_missing"]);
  });
  it("runG1 enforces it only when asked (the review runner asks)", () => {
    const d: any = { tier: "standard", briefing_type: "sector", contents: [md()], source_refs: [{ ref: "S1", url: "https://a", title: "t" }], hypothesis: "h" };
    const base = { draft: d, briefing: {}, pages: 9, resolve: () => ({ resolved: true, text: "x", title: "t" }) };
    expect(runG1(base as any).blockers.map((b: any) => b.code)).not.toContain("thesis_missing");
    expect(runG1({ ...base, requireThesis: true } as any).blockers.map((b: any) => b.code)).toContain("thesis_missing");
  });
});

describe("lane runner", () => {
  it("a no_thesis draft is not staged, is not a failure, and is counted", async () => {
    const fixtures = loadFixtures();
    const db = createFixtureDb(fixtures);
    const out = vi.fn();
    const statuslog = createStatusLog({ token: undefined, now: () => new Date("2026-11-09T15:04:00Z"), out });
    const generate = async () => { throw new NoThesisError("no model client (set ANTHROPIC_API_KEY)"); };
    const s: any = await runLane({ lane: "domains", db, statuslog, now: () => new Date("2026-11-09T15:04:00Z"), out, generate, quota: 2, dryRun: true } as any);
    expect(s.no_thesis).toBe(2);
    expect(s.failed).toBe(0);
    expect(s.drafted).toBe(0);
    expect(s.errors).toEqual([]);
    expect(s.lines.join("\n")).toMatch(/no_thesis: .* not staged/);
  });
});

describe("applyThesis", () => {
  it("replaces the cover deck and the Take body, labels the Take, records the thesis once", () => {
    const w: any = { thesis: GOOD_THESIS, take: GOOD_TAKE, label: TAKE_LABEL, model: "m", attempts: 1 };
    const out = applyThesis(draft, w);
    expect(out.manuscript_md).toContain(GOOD_THESIS);
    expect(out.manuscript_md).toContain(`**${TAKE_LABEL}.** Our view is`);
    expect(out.manuscript_md).not.toContain("old take");
    const twice = applyThesis(out, w);
    expect((twice.manuscript_md.match(/<!-- bl3-08/g) ?? []).length).toBe(1);
  });
});
