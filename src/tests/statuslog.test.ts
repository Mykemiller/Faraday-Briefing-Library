import { describe, expect, it, vi } from "vitest";
import {
  createStatusLog,
  formatCt,
  formatLogLine,
  formatQuestionLine,
  locateSections,
  chunk,
  paragraphBlock,
  MAX_BLOCKS_PER_CALL,
  MAX_RICH_TEXT_CHARS,
  STATUS_PAGE_ID,
} from "../../scripts/statuslog.mjs";

const PAGE = STATUS_PAGE_ID;
const heading = (id: string, text: string, type = "heading_2") => ({
  object: "block",
  id,
  type,
  [type]: { rich_text: [{ type: "text", plain_text: text, text: { content: text } }] },
});
const para = (id: string, text: string) => ({
  object: "block",
  id,
  type: "paragraph",
  paragraph: { rich_text: [{ type: "text", plain_text: text, text: { content: text } }] },
});

/** The live page, as fetched 2026-11-09: title, intro, Questions (with its intro paragraph), then Log (empty). */
const PAGE_CHILDREN = [
  para("p-intro", "One line per stage gate per brief…"),
  para("p-format", "YYYY-MM-DD HH:MM CT · …"),
  para("p-gates", "Gates: DRAFTED → …"),
  para("p-plan", "Release 46-26-v01 plan…"),
  heading("h-q", "Questions for Myke"),
  para("p-q-intro", "Runners append here…"),
  heading("h-log", "Log"),
];

type Call = { method: string; url: string; body?: any; headers: Record<string, string> };

function mockNotion(opts: { children?: any[]; statuses?: number[]; retryAfter?: string } = {}) {
  const calls: Call[] = [];
  const statuses = [...(opts.statuses ?? [])];
  let counter = 0;
  const fetch = vi.fn(async (url: string, init: any) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, url, body, headers: init.headers });
    const forced = statuses.shift();
    if (forced && forced !== 200) {
      return {
        ok: false,
        status: forced,
        headers: { get: (h: string) => (h.toLowerCase() === "retry-after" ? opts.retryAfter ?? null : null) },
        json: async () => ({ message: `forced ${forced}` }),
      };
    }
    if (init.method === "GET") {
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: opts.children ?? PAGE_CHILDREN, has_more: false }) };
    }
    // PATCH: echo back one created block per child, with fresh ids
    const results = body.children.map(() => ({ object: "block", id: `new-${++counter}` }));
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ object: "list", results }) };
  });
  return { fetch, calls };
}

describe("statuslog formatting", () => {
  it("renders US Central time, honouring DST (CDT in July, CST in November)", () => {
    expect(formatCt(new Date("2026-07-01T15:04:00Z"))).toBe("2026-07-01 10:04 CT");
    expect(formatCt(new Date("2026-11-09T15:04:00Z"))).toBe("2026-11-09 09:04 CT");
    // midnight UTC rolls back to the previous CT day; hour is 2-digit 24h (no "24:00")
    expect(formatCt(new Date("2026-11-10T05:30:00Z"))).toBe("2026-11-09 23:30 CT");
    expect(formatCt(new Date("2026-11-10T06:00:00Z"))).toBe("2026-11-10 00:00 CT");
  });

  it("formats a log line in the fixed seven-column shape with an 8-char id", () => {
    const line = formatLogLine(
      { briefing_id: "7ae53c93-be04-4e22-a8c3-b66fb05771b6", lane: "theaters", tier: "deep", gate: "DRAFTED", result: "PASS", sentence: "Staged draft v2." },
      new Date("2026-11-09T15:04:00Z"),
    );
    expect(line).toBe("2026-11-09 09:04 CT · 7ae53c93 · theaters · deep · DRAFTED · PASS · Staged draft v2.");
    expect(line.split(" · ")).toHaveLength(7);
  });

  it("keeps the column count fixed when a sentence carries newlines or the separator", () => {
    const line = formatLogLine(
      { briefing_id: "abcdefgh-1", lane: "domains", tier: "standard", gate: "G1-AUTO", result: "FAIL", sentence: "page count 17\n· over range · cut body" },
      new Date("2026-11-09T15:04:00Z"),
    );
    expect(line.split(" · ")).toHaveLength(7);
    expect(line.endsWith("page count 17, over range, cut body")).toBe(true);
  });

  it("rejects unknown gates and results, and missing fields", () => {
    const base = { briefing_id: "abcdefgh", lane: "domains", tier: "standard", sentence: "x" };
    expect(() => formatLogLine({ ...base, gate: "G9", result: "PASS" })).toThrow(/gate/);
    expect(() => formatLogLine({ ...base, gate: "DRAFTED", result: "OK" })).toThrow(/result/);
    expect(() => formatLogLine({ ...base, gate: "DRAFTED", result: "PASS", sentence: "" })).toThrow(/sentence/);
    expect(() => formatLogLine({ ...base, briefing_id: "", gate: "DRAFTED", result: "PASS" })).toThrow(/briefing_id/);
  });

  it("formats a question line with its default", () => {
    const line = formatQuestionLine(
      { issue: "FDY-280", text: "Should institutions share the companies lane?", default: "separate lane" },
      new Date("2026-11-09T15:04:00Z"),
    );
    expect(line).toBe("2026-11-09 09:04 CT · FDY-280 · Should institutions share the companies lane? · Default: separate lane");
  });

  it("truncates a paragraph to Notion's rich-text limit", () => {
    const block = paragraphBlock("x".repeat(MAX_RICH_TEXT_CHARS + 50));
    expect(block.paragraph.rich_text[0].text.content.length).toBe(MAX_RICH_TEXT_CHARS);
  });

  it("locates each section's heading and last block", () => {
    const s = locateSections(PAGE_CHILDREN);
    expect(s.question).toEqual({ headingId: "h-q", lastId: "p-q-intro", count: 1 });
    expect(s.log).toEqual({ headingId: "h-log", lastId: "h-log", count: 0 });
  });
});

describe("statuslog client", () => {
  const NOW = () => new Date("2026-11-09T15:04:00Z");

  it("appends log lines after the Log heading and questions after the last Questions block", async () => {
    const { fetch, calls } = mockNotion();
    const sl = createStatusLog({ token: "secret-token", fetch, now: NOW });
    sl.log({ briefing_id: "7ae53c93-x", lane: "theaters", tier: "deep", gate: "DRAFTED", result: "PASS", sentence: "one" });
    sl.question({ issue: "FDY-280", text: "q", default: "d" });
    const r = await sl.flush();

    expect(r.appended).toBe(2);
    expect(r.calls).toBe(3); // 1 GET children + 1 PATCH per section
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toContain(`/blocks/${PAGE}/children`);
    expect(calls[0].headers.Authorization).toBe("Bearer secret-token");
    expect(calls[0].headers["Notion-Version"]).toBeTruthy();

    const patches = calls.filter((c) => c.method === "PATCH");
    const q = patches.find((c) => c.body.children[0].paragraph.rich_text[0].text.content.includes("FDY-280"));
    const l = patches.find((c) => c.body.children[0].paragraph.rich_text[0].text.content.includes("7ae53c93"));
    expect(q?.body.after).toBe("p-q-intro");
    expect(l?.body.after).toBe("h-log");
    expect(l?.body.children[0].type).toBe("paragraph");
    expect(sl.pending()).toBe(0);
  });

  it("chunks to 100 blocks per call and chains `after` through the batches", async () => {
    const { fetch, calls } = mockNotion();
    const sl = createStatusLog({ token: "t", fetch, now: NOW });
    for (let i = 0; i < 250; i += 1) sl.log({ briefing_id: `id${i}`.padEnd(8, "0"), lane: "domains", tier: "standard", gate: "DRAFTED", result: "PASS", sentence: `n${i}` });
    const r = await sl.flush();
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.body.children.length)).toEqual([100, 100, 50]);
    expect(chunk(new Array(250).fill(0)).length).toBe(3);
    expect(patches[0].body.after).toBe("h-log");
    expect(patches[1].body.after).toBe("new-100");
    expect(patches[2].body.after).toBe("new-200");
    expect(r.appended).toBe(250);
    expect(MAX_BLOCKS_PER_CALL).toBe(100);
  });

  it("retries 429 with Retry-After, then succeeds", async () => {
    const { fetch, calls } = mockNotion({ statuses: [200, 429, 429, 200], retryAfter: "2" });
    const sleep = vi.fn(async () => {});
    const sl = createStatusLog({ token: "t", fetch, now: NOW, sleep });
    sl.log({ briefing_id: "abcdefgh", lane: "domains", tier: "standard", gate: "DRAFTED", result: "PASS", sentence: "x" });
    const r = await sl.flush();
    expect(r.appended).toBe(1);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(3);
  });

  it("backs off exponentially without Retry-After and gives up after maxRetries, never leaking the token", async () => {
    const { fetch } = mockNotion({ statuses: [200, 429, 429, 429] });
    const sleep = vi.fn(async (_ms: number) => {});
    const sl = createStatusLog({ token: "super-secret", fetch, now: NOW, sleep, maxRetries: 2, baseDelayMs: 100 });
    sl.log({ briefing_id: "abcdefgh", lane: "domains", tier: "standard", gate: "DRAFTED", result: "PASS", sentence: "x" });
    await expect(sl.flush()).rejects.toThrow(/429/);
    await expect(
      (async () => {
        try {
          await sl.flush();
        } catch (e) {
          return String((e as Error).message);
        }
        return "";
      })(),
    ).resolves.not.toContain("super-secret");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it("refuses to append when a section heading is missing", async () => {
    const { fetch } = mockNotion({ children: [para("p1", "no headings here")] });
    const sl = createStatusLog({ token: "t", fetch, now: NOW });
    sl.log({ briefing_id: "abcdefgh", lane: "domains", tier: "standard", gate: "DRAFTED", result: "PASS", sentence: "x" });
    await expect(sl.flush()).rejects.toThrow(/no "## Log" heading/);
  });

  it("in dry-run (or without a token) sends nothing and prints the lines instead", async () => {
    const { fetch } = mockNotion();
    const out = vi.fn();
    const sl = createStatusLog({ token: "t", fetch, now: NOW, dryRun: true, out });
    sl.log({ briefing_id: "abcdefgh", lane: "domains", tier: "standard", gate: "DRAFTED", result: "PASS", sentence: "x" });
    const r = await sl.flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(r.skipped).toBe(true);
    expect(out).toHaveBeenCalledTimes(1);
    expect(String(out.mock.calls[0][0])).toContain("Log ← 2026-11-09 09:04 CT · abcdefgh · domains");

    const noToken = createStatusLog({ token: undefined, fetch, now: NOW, out });
    noToken.question({ issue: "FDY-1", text: "t", default: "d" });
    const r2 = await noToken.flush();
    expect(r2.skipped).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("flushing an empty queue makes no request", async () => {
    const { fetch } = mockNotion();
    const sl = createStatusLog({ token: "t", fetch, now: NOW });
    const r = await sl.flush();
    expect(r.appended).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
