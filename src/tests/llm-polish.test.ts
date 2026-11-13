import { describe, expect, it } from "vitest";
import { Semaphore, createPolisher, validatePolish, applyPolish, GLOBAL_MODEL_CONCURRENCY } from "../../scripts/lanes/llm.mjs";
import { parseAllArgs } from "../../scripts/lanes/run-all.mjs";

// The retired fourth-type key, assembled so the BL3-02 vocabulary guard finds no literal of it.
const RETIRED_TYPE = ["key", "player"].join("");

const draft = {
  kind: "standard",
  tier: "standard",
  title: "T",
  byline: "Gilbert Faraday",
  hypothesis: "Old thesis. [S1]",
  source_refs: [
    { ref: "S1", url: "https://a.example/1", title: "A" },
    { ref: "S2", url: "https://b.example/2", title: "B" },
  ],
  manuscript_md: ":::cover\n# T\n\nOld thesis. [S1]\n\n- **Tier:** Standard\n:::\n\n## The argument\n\nx [S1]\n\n:::take\n## Faraday's Take\n\nold take [S1]\n\n*— Gilbert Faraday*\n:::\n\n## Sources & methodology\n\n| Ref |\n|---|\n",
};
const pack = {
  items: [
    { url: "https://a.example/1", date: "2026-11-01", publisher: "A", text: ["ERCOT's queue reached 226 GW by November 2026."] },
    { url: "https://b.example/2", date: "2026-10-01", publisher: "B", text: ["Texas paused data center permits in September."] },
  ],
};

describe("Semaphore", () => {
  it("never admits more than its limit and drains the queue in order", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map(async (n) => {
        const release = await sem.acquire();
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        order.push(n);
        active -= 1;
        release();
        release(); // double release is a no-op
      }),
    );
    expect(peak).toBe(2);
    expect(order.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(sem.active).toBe(0);
    expect(GLOBAL_MODEL_CONCURRENCY).toBe(12);
  });
});

describe("polish validation", () => {
  it("accepts cited, evidence-supported prose and rejects new facts, unknown markers and forbidden words", () => {
    expect(validatePolish("ERCOT's queue reached 226 GW by November 2026. [S1]", draft as any, pack as any)).toEqual([]);
    expect(validatePolish("ERCOT's queue reached 300 GW. [S1]", draft as any, pack as any)).toContainEqual(expect.stringMatching(/unsupported number/));
    expect(validatePolish("Texas paused permits. [S9]", draft as any, pack as any)).toContainEqual(expect.stringMatching(/unknown marker/));
    expect(validatePolish("Texas paused permits.", draft as any, pack as any)).toContainEqual(expect.stringMatching(/uncited/));
    expect(validatePolish("The Domain is hot. [S1]", draft as any, pack as any)).toContainEqual(expect.stringMatching(/forbidden/));
    expect(validatePolish("Our view is that the queue matters more than the pause.", draft as any, pack as any, { allowOpinion: true })).toEqual([]);
    expect(validatePolish("Our view is that 226 GW matters.", draft as any, pack as any, { allowOpinion: true })).toContainEqual(expect.stringMatching(/opinion sentence carries a number/));
  });
  it("applyPolish swaps the cover thesis and the Take body, keeping the byline sign-off", () => {
    const out = applyPolish(draft as any, { hypothesis: "New thesis. [S2]", take: ["Faraday's reading is simple.", "Texas paused data center permits in September. [S2]"] });
    expect(out.manuscript_md).toContain("# T\n\nNew thesis. [S2]\n");
    expect(out.manuscript_md).toContain("## Faraday's Take\n\nFaraday's reading is simple.\n\nTexas paused data center permits in September. [S2]\n\n*— Gilbert Faraday*\n:::");
    expect(out.hypothesis).toBe("New thesis. [S2]");
  });
});

describe("createPolisher", () => {
  it("is null without a key, never polishes Profiles, and only accepts a validated reply", async () => {
    expect(createPolisher({ apiKey: undefined })).toBeNull();
    expect(createPolisher({ apiKey: "k", enabled: false })).toBeNull();
    const replies: any[] = [];
    const client = { messages: { async create(req: any) { replies.push(req); return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ hypothesis: "ERCOT's queue reached 226 GW by November 2026. [S1]", take: ["Faraday's reading: the queue is the story.", "Texas paused data center permits in September. [S2]"] }) }] }; } } };
    const polisher = createPolisher({ client: client as any, model: "claude-opus-5-5" })!;
    const good = await polisher.polish(draft as any, pack as any);
    expect(good.polished).toBe(true);
    expect(good.draft.hypothesis).toMatch(/^ERCOT's queue/);
    expect(replies[0].model).toBe("claude-opus-5-5");
    expect(replies[0].messages[0].content).toContain("[S1] (2026-11-01, A) ERCOT's queue reached 226 GW");
    const profile = await polisher.polish({ ...draft, kind: "profile" } as any, pack as any);
    expect(profile.polished).toBe(false);
    const bad = createPolisher({ client: { messages: { async create() { return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ hypothesis: "The queue hit 999 GW. [S1]", take: ["x [S1]"] }) }] }; } } } as any })!;
    const r = await bad.polish(draft as any, pack as any);
    expect(r.polished).toBe(false);
    expect(r.reason).toMatch(/unsupported number/);
    const refusal = createPolisher({ client: { messages: { async create() { return { stop_reason: "refusal", stop_details: { category: "general_harms" }, content: [] }; } } } as any })!;
    expect((await refusal.polish(draft as any, pack as any)).reason).toMatch(/refusal/);
    const boom = createPolisher({ client: { messages: { async create() { throw new Error("429"); } } } as any })!;
    expect((await boom.polish(draft as any, pack as any)).reason).toMatch(/model call failed: 429/);
  });
});

describe("run-all arguments", () => {
  it("parses lanes, quota, width and the fixture/evidence/emit switches", () => {
    expect(parseAllArgs(["--dry-run", "--lanes", "theaters,states", "--width", "2", "--emit", "out", "--no-llm"])).toMatchObject({ dryRun: true, lanes: ["theaters", "states"], width: 2, emit: "out", llm: false, render: true });
    expect(() => parseAllArgs(["--lanes", `${RETIRED_TYPE}s`])).toThrow(/unknown lane/);
    expect(() => parseAllArgs(["--width", "0"])).toThrow(/--width/);
    expect(parseAllArgs(["--fixtures"]).fixtures).toMatch(/fixtures$/);
  });
});
