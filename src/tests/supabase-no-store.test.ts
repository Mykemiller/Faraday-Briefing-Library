import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Next's Data Cache must never store a Supabase read (2026-11-14 fetch-cache fix): `/library`
 * served the first render's `briefings` rows after they changed, despite `dynamic = "force-dynamic"`.
 * Both server-side clients pass `cache: "no-store"` on every request. These run a real supabase-js
 * query through each client against a stubbed global fetch, so a supabase-js upgrade that stops
 * forwarding init options would fail here too.
 */
describe("server-side supabase clients bypass Next's Data Cache", () => {
  const calls: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://stub.supabase.local");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "stub-service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "stub-anon");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["supabaseAdmin", supabaseAdmin],
    ["supabaseServer", supabaseServer],
  ])("%s sends cache: 'no-store' on a PostgREST read", async (_name, make) => {
    const { error } = await make().from("briefings").select("id").eq("status", "published");
    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/rest/v1/briefings");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("supabaseAdmin keeps no-store on an rpc() call too", async () => {
    await supabaseAdmin().rpc("jw_token_balance", { p_sub: "00000000-0000-0000-0000-000000000000" });
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("both client factories wire the shared noStoreFetch", () => {
    for (const f of ["src/lib/supabase/admin.ts", "src/lib/supabase/server.ts"]) {
      const src = readFileSync(resolve(__dirname, "../..", f), "utf8");
      expect(src, f).toMatch(/global:\s*\{\s*fetch:\s*noStoreFetch\s*\}/);
    }
  });
});
