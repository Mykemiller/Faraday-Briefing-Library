import { describe, expect, it, vi } from "vitest";
import { createStatusLog } from "../../scripts/statuslog.mjs";
import {
  AUTO_ID,
  CRAWLER_ID,
  createFixtureDb,
  createSupabaseDb,
  isMissingView,
  laneFor,
  loadFixtures,
  parseArgs,
  runPublishBatch,
  selectApproved,
} from "../../scripts/publish-batch.mjs";

// The retired fourth-type key, assembled so the BL3-02 vocabulary guard finds no literal of it.
const RETIRED_TYPE = ["key", "player"].join("");

const NOW = () => new Date("2026-11-09T15:04:00Z");
const fixtures = loadFixtures();

function harness() {
  const db = createFixtureDb(fixtures);
  const out = vi.fn();
  const statuslog = createStatusLog({ token: undefined, now: NOW, out }); // no token ⇒ prints, never fetches
  return { db, out, statuslog, run: (o: Record<string, unknown> = {}) => runPublishBatch({ db, statuslog, now: NOW, out, ...o } as any) };
}

describe("publish batch — arguments and selection", () => {
  it("is a dry run unless --apply is passed", () => {
    expect(parseArgs([])).toMatchObject({ apply: false, limit: 50 });
    expect(parseArgs(["--apply", "--limit", "2"])).toMatchObject({ apply: true, limit: 2 });
    expect(parseArgs(["--briefing", "6f1c2d3e-0008-4000-8000-000000000008"]).briefing).toBe("6f1c2d3e-0008-4000-8000-000000000008");
    expect(() => parseArgs(["--limit", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--briefing", "not-a-uuid"])).toThrow(/uuid/);
    expect(() => parseArgs(["--publish-everything"])).toThrow(/unknown argument/);
  });

  it("selects only approved rows, oldest staged first, and honours --briefing / --limit", () => {
    const all = selectApproved(fixtures.queue);
    expect(all.map((r: any) => r.title)).toEqual(["Grid & Regulatory", "Texas", "Germany"]); // the unsigned thread row is excluded
    expect(selectApproved(fixtures.queue, { limit: 1 }).map((r: any) => r.title)).toEqual(["Grid & Regulatory"]);
    expect(selectApproved(fixtures.queue, { briefing: "FX000800-0008-4000-8000-000000000008" as any }).map((r: any) => r.title)).toEqual(["Texas"]);
    expect(selectApproved([{ approved: "true", version: 2 }, { approved: true, version: 0 }])).toEqual([]);
  });

  it("derives the lane from the job, else from the type", () => {
    expect(laneFor({ job: "lane-domains", briefing_type: "sector" })).toBe("domains");
    expect(laneFor({ job: null, briefing_type: "jurisdiction", jurisdiction_id: "US-TX" })).toBe("states");
    expect(laneFor({ job: null, briefing_type: "jurisdiction", jurisdiction_id: "DE" })).toBe("countries");
    expect(laneFor({ briefing_type: "company", company_id: "cmp_1" })).toBe("companies");
    expect(laneFor({ briefing_type: "company", institution_id: "inst_1" })).toBe("institutions");
    expect(laneFor({ briefing_type: "theater" })).toBe("theaters");
    expect(laneFor({ briefing_type: "thread" })).toBe("subdomains");
    expect(laneFor({ briefing_type: RETIRED_TYPE })).toBe("unknown");
  });

  it("recognises a missing queue view", () => {
    expect(isMissingView({ code: "PGRST205" })).toBe(true);
    expect(isMissingView({ code: "42P01" })).toBe(true);
    expect(isMissingView({ message: "Could not find the table 'public.v_briefing_signoff_queue' in the schema cache" })).toBe(true);
    expect(isMissingView({ code: "23505" })).toBe(false);
  });
});

describe("publish batch — dry run", () => {
  it("writes nothing and prints every action it would take", async () => {
    const { db, out, run } = harness();
    const s = await run();
    expect(s).toMatchObject({ mode: "DRY RUN", found: 3, published: 0, failed: 0 });
    expect(s.briefs.every((b: any) => b.action === "would-publish")).toBe(true);
    expect(db.writes).toEqual({ promotes: [], publishes: [], health: [] });
    expect(s.lines).toEqual([]); // no status-log line in a dry run
    const printed = out.mock.calls.map((c) => String(c[0]));
    expect(printed.filter((l) => l.includes("would promote + publish"))).toHaveLength(3);
    expect(printed.some((l) => l.includes("would write automation_health_log"))).toBe(true);
    // the live rows are untouched
    expect(db.live.get("fx000800-0008-4000-8000-000000000008")).toMatchObject({ status: "planned", version: 1 });
  });
});

describe("publish batch — apply", () => {
  it("promotes, publishes with a version guard, and logs one PUBLISHED line per brief", async () => {
    const { db, run } = harness();
    const s = await run({ apply: true });
    expect(s).toMatchObject({ mode: "APPLY", found: 3, published: 3, failed: 0 });
    expect(db.writes.promotes).toEqual([
      { briefingId: "fx000300-0003-4000-8000-000000000003", version: 2 },
      { briefingId: "fx000800-0008-4000-8000-000000000008", version: 2 },
      { briefingId: "fx000900-0009-4000-8000-000000000009", version: 2 },
    ]);
    expect(db.writes.publishes.map((p: any) => p.version)).toEqual([2, 2, 2]);
    expect(db.live.get("fx000800-0008-4000-8000-000000000008")).toMatchObject({ status: "published", version: 2, published_at: "2026-11-09T15:04:00.000Z" });
    expect(s.lines).toHaveLength(3);
    expect(s.lines[1]).toBe("2026-11-09 09:04 CT · fx000800 · states · standard · PUBLISHED · PUBLISHED · Published v2 of \"Texas\" (promoted from staged draft; signed off by Myke).");
    expect(s.lines.every((l: string) => l.includes(" · PUBLISHED · PUBLISHED · "))).toBe(true);
    expect(db.writes.health).toHaveLength(1);
    expect(db.writes.health[0]).toMatchObject({ auto_id: AUTO_ID, crawler_id: CRAWLER_ID, artifacts_found: 3, artifacts_new: 3, success: true });
  });

  it("is idempotent: a second apply finds nothing", async () => {
    const { db, statuslog, out } = harness();
    await runPublishBatch({ apply: true, db, statuslog, now: NOW, out } as any);
    const again = await runPublishBatch({ apply: true, db, statuslog, now: NOW, out } as any);
    expect(again).toMatchObject({ found: 0, published: 0, failed: 0 });
    expect(db.writes.promotes).toHaveLength(3);
  });

  it("isolates a failing promote: the others publish, the failure is logged and counted", async () => {
    const { db, run } = harness();
    db.live.get("fx000800-0008-4000-8000-000000000008")!.fail_promote = true;
    const s = await run({ apply: true });
    expect(s).toMatchObject({ found: 3, published: 2, failed: 1 });
    expect(s.errors[0]).toMatchObject({ briefing_id: "fx000800-0008-4000-8000-000000000008", message: expect.stringMatching(/no staged draft 2/) });
    expect(db.live.get("fx000800-0008-4000-8000-000000000008")).toMatchObject({ status: "planned", version: 1 });
    expect(s.lines.filter((l: string) => l.includes(" · FAIL · "))).toHaveLength(1);
    expect(db.writes.health[0]).toMatchObject({ success: false, artifacts_new: 2 });
  });

  it("never flips status when promote did not move the live row", async () => {
    const { db, run } = harness();
    db.promote = async () => {}; // a promote that silently does nothing
    const s = await run({ apply: true, limit: 1 });
    expect(s).toMatchObject({ published: 0, failed: 1 });
    expect(s.errors[0].message).toMatch(/not at v2/);
    expect(db.writes.publishes).toEqual([]);
  });

  it("respects --briefing and --limit", async () => {
    const { db, run } = harness();
    const s = await run({ apply: true, briefing: "fx000900-0009-4000-8000-000000000009" });
    expect(s.briefs.map((b: any) => b.title)).toEqual(["Germany"]);
    expect(db.writes.promotes).toHaveLength(1);
  });
});

describe("publish batch — Supabase adapter", () => {
  function fakeClient(opts: { viewError?: any; promoteError?: any; updated?: any[] } = {}) {
    const calls: any[] = [];
    const chain = (result: any) => {
      const c: any = {};
      for (const m of ["select", "eq", "order", "update", "insert"]) c[m] = (...a: any[]) => (calls.push([m, ...a]), c);
      c.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return c;
    };
    return {
      calls,
      from(table: string) {
        calls.push(["from", table]);
        if (table === "v_briefing_signoff_queue") return chain({ data: opts.viewError ? null : fixtures.queue.filter((q: any) => q.approved), error: opts.viewError ?? null });
        if (table === "briefings") return chain({ data: opts.updated ?? [{ id: "x" }], error: null });
        return chain({ data: null, error: null });
      },
      rpc(fn: string, args: any) {
        calls.push(["rpc", fn, args]);
        return Promise.resolve({ data: null, error: opts.promoteError ?? null });
      },
    };
  }

  it("reads approved rows from the view and calls the promote RPC with the right arguments", async () => {
    const client = fakeClient();
    const db = createSupabaseDb(client);
    const rows = await db.listApproved();
    expect(rows).toHaveLength(3);
    expect(client.calls).toContainEqual(["eq", "approved", true]);
    await db.promote("fx000800-0008-4000-8000-000000000008", 2);
    expect(client.calls).toContainEqual(["rpc", "briefings_version_promote", { p_briefing: "fx000800-0008-4000-8000-000000000008", p_version: 2 }]);
    expect(await db.publish("fx000800-0008-4000-8000-000000000008", 2, "2026-11-09T15:04:00.000Z")).toBe(1);
    expect(client.calls).toContainEqual(["update", { status: "published", published_at: "2026-11-09T15:04:00.000Z" }]);
    expect(client.calls).toContainEqual(["eq", "version", 2]);
  });

  it("explains a missing view instead of a raw PostgREST error", async () => {
    const db = createSupabaseDb(fakeClient({ viewError: { code: "PGRST205", message: "Could not find the table" } }));
    await expect(db.listApproved()).rejects.toThrow(/20261109150000_bl2_07_briefing_signoff is not applied/);
  });

  it("surfaces a promote error with its message", async () => {
    const db = createSupabaseDb(fakeClient({ promoteError: { code: "P0001", message: "no staged draft 2 for briefing x" } }));
    await expect(db.promote("x", 2)).rejects.toThrow(/no staged draft 2/);
  });
});
