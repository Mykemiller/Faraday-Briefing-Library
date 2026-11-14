import { describe, expect, it, vi } from "vitest";
import {
  runChecks,
  decodeJwtRef,
  hasWrappingQuotes,
  formatResult,
  overall,
  writeTestParts,
  describeNetworkError,
  PROJECT_REF,
  STATUS_PAGE_ID,
  REQUIRED_ENV,
  EGRESS_HOSTS,
} from "../../scripts/ops/check-run-env.mjs";
import { formatPartsLine, createStatusLog } from "../../scripts/statuslog.mjs";

/** A syntactically valid, unsigned JWT with the given ref (test fixture only; not a real key). */
function fakeJwt(ref: string, extra: Record<string, unknown> = {}) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref, role: "service_role", ...extra })}.c2lnbmF0dXJl`;
}

const GOOD_KEY = fakeJwt(PROJECT_REF);
const NOTION = "ntn_testtoken_fixture_value_0001";
const ANTHROPIC = "sk-ant-fixture-value-0001";

function goodEnv(over: Record<string, string | undefined> = {}) {
  return {
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
    NOTION_TOKEN: NOTION,
    ANTHROPIC_API_KEY: ANTHROPIC,
    HTTPS_PROXY: "http://127.0.0.1:9999",
    NODE_USE_ENV_PROXY: "1",
    ...over,
  };
}

type Route = (url: string, init: any) => { status: number } | Error;

/** Stub fetch: every host answers by default (Supabase 200, Notion page 200, bare hosts 404). */
function stubFetch(over: Partial<Record<"supabase" | "notionHead" | "notionPage" | "anthropic", { status: number } | Error>> = {}) {
  const calls: { url: string; init: any }[] = [];
  const route: Route = (url) => {
    if (url.includes(".supabase.co/rest/v1/briefings")) return over.supabase ?? { status: 200 };
    if (url === "https://api.notion.com") return over.notionHead ?? { status: 404 };
    if (url.includes(`api.notion.com/v1/pages/${STATUS_PAGE_ID}`)) return over.notionPage ?? { status: 200 };
    if (url === "https://api.anthropic.com") return over.anthropic ?? { status: 404 };
    return new Error(`unexpected url ${url}`);
  };
  const fetch = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const r = route(url, init);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: () => null }, json: async () => ({}) };
  });
  return { fetch, calls };
}

const byName = (rs: any[], name: string) => rs.find((r) => r.name === name);

/** Every secret fixture value, to assert none ever reaches output. */
const SECRETS = [GOOD_KEY, NOTION, ANTHROPIC, GOOD_KEY.split(".")[1], GOOD_KEY.split(".")[2]];
function assertNoSecrets(text: string) {
  for (const s of SECRETS) expect(text).not.toContain(s);
}

describe("decodeJwtRef / hasWrappingQuotes", () => {
  it("reads only the ref claim of a JWT", () => {
    expect(decodeJwtRef(GOOD_KEY)).toEqual({ ref: PROJECT_REF, kind: "jwt" });
  });
  it("still reports the ref of a key wrapped in typographic quotes", () => {
    expect(decodeJwtRef(`“${fakeJwt("uuzzfeaevxilwizaittq")}”`).ref).toBe("uuzzfeaevxilwizaittq");
  });
  it("flags opaque and malformed keys without throwing", () => {
    expect(decodeJwtRef("sb_secret_abc").kind).toBe("sb_secret");
    expect(decodeJwtRef("not-a-jwt").ref).toBeNull();
    expect(decodeJwtRef("a.b.c").ref).toBeNull();
  });
  it("detects ASCII and typographic wrapping quotes", () => {
    for (const q of ['"', "'", "“", "”", "‘", "’", "`"]) expect(hasWrappingQuotes(`${q}abc`)).toBe(true);
    expect(hasWrappingQuotes("abc”")).toBe(true);
    expect(hasWrappingQuotes("abc")).toBe(false);
  });
});

describe("runChecks", () => {
  it("ok: every check PASSes with a correct environment", async () => {
    const { fetch, calls } = stubFetch();
    const rs = await runChecks({ env: goodEnv(), fetch: fetch as any });
    expect(rs.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(rs.every((r) => r.status === "PASS")).toBe(true);
    expect(overall(rs)).toBe("PASS");
    expect(byName(rs, "service-key").reason).toContain(`ref=${PROJECT_REF}`);
    // (c) hits exactly the agreed endpoint with the key in apikey + bearer
    const sb = calls.find((c) => c.url.includes("/rest/v1/"))!;
    expect(sb.url).toBe(`https://${PROJECT_REF}.supabase.co/rest/v1/briefings?select=id&limit=1`);
    expect(sb.init.headers.apikey).toBe(GOOD_KEY);
    expect(sb.init.headers.Authorization).toBe(`Bearer ${GOOD_KEY}`);
    // (d)/(f) are HEADs
    expect(calls.find((c) => c.url === "https://api.notion.com")!.init.method).toBe("HEAD");
    expect(calls.find((c) => c.url === "https://api.anthropic.com")!.init.method).toBe("HEAD");
  });

  it("quoted key: (b) FAILs on wrapping quotes, the request still uses the unquoted key", async () => {
    const { fetch, calls } = stubFetch();
    const rs = await runChecks({ env: goodEnv({ SUPABASE_SERVICE_ROLE_KEY: `“${GOOD_KEY}”` }), fetch: fetch as any });
    const b = byName(rs, "service-key");
    expect(b.status).toBe("FAIL");
    expect(b.reason).toMatch(/quote/);
    expect(overall(rs)).toBe("FAIL");
    expect(calls.find((c) => c.url.includes("/rest/v1/"))!.init.headers.apikey).toBe(GOOD_KEY);
  });

  it("wrong ref: (b) FAILs naming both refs; (c) FAILs on PostgREST 401", async () => {
    const wrong = fakeJwt("uuzzfeaevxilwizaittq");
    const { fetch } = stubFetch({ supabase: { status: 401 } });
    const rs = await runChecks({ env: goodEnv({ SUPABASE_SERVICE_ROLE_KEY: wrong }), fetch: fetch as any });
    expect(byName(rs, "service-key").status).toBe("FAIL");
    expect(byName(rs, "service-key").reason).toContain("ref=uuzzfeaevxilwizaittq");
    expect(byName(rs, "service-key").reason).toContain(PROJECT_REF);
    expect(byName(rs, "supabase-rest").status).toBe("FAIL");
    expect(byName(rs, "supabase-rest").reason).toContain("401");
  });

  it("missing names: (a) lists them, dependent checks SKIP, no request carries an undefined credential", async () => {
    const { fetch, calls } = stubFetch();
    const rs = await runChecks({ env: goodEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined, NOTION_TOKEN: "  " }), fetch: fetch as any });
    expect(byName(rs, "env-names").status).toBe("FAIL");
    expect(byName(rs, "env-names").reason).toBe("missing: SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN");
    expect(byName(rs, "service-key").status).toBe("SKIP");
    expect(byName(rs, "supabase-rest").status).toBe("SKIP");
    expect(byName(rs, "notion-page").status).toBe("SKIP");
    expect(calls.some((c) => c.url.includes("/rest/v1/") || c.url.includes("/v1/pages/"))).toBe(false);
  });

  it("SUPABASE_URL for another project FAILs (c) without sending the key there", async () => {
    const { fetch, calls } = stubFetch();
    const rs = await runChecks({ env: goodEnv({ SUPABASE_URL: "https://uuzzfeaevxilwizaittq.supabase.co" }), fetch: fetch as any });
    expect(byName(rs, "supabase-rest").status).toBe("FAIL");
    expect(byName(rs, "supabase-rest").reason).toContain("uuzzfeaevxilwizaittq.supabase.co");
    expect(calls.some((c) => c.url.includes("uuzzfeaevxilwizaittq"))).toBe(false);
  });

  it("blocked egress: a network error FAILs (d)/(f); any HTTP status counts as reachable", async () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("Proxy response (403) !== 200"), {}) });
    const { fetch } = stubFetch({ notionHead: err, notionPage: err, anthropic: { status: 401 } });
    const rs = await runChecks({ env: goodEnv(), fetch: fetch as any });
    expect(byName(rs, "notion-egress").status).toBe("FAIL");
    expect(byName(rs, "notion-egress").reason).toMatch(/api\.notion\.com unreachable/);
    expect(byName(rs, "notion-page").status).toBe("FAIL");
    expect(byName(rs, "anthropic-egress").status).toBe("PASS");
  });

  it("notion page 404 names the share fix", async () => {
    const { fetch } = stubFetch({ notionPage: { status: 404 } });
    const rs = await runChecks({ env: goodEnv(), fetch: fetch as any });
    expect(byName(rs, "notion-page").status).toBe("FAIL");
    expect(byName(rs, "notion-page").reason).toMatch(/not shared/);
  });

  it("(g) NODE_USE_ENV_PROXY: FAIL when a proxy is set without it, SKIP with no proxy", async () => {
    const { fetch } = stubFetch();
    let rs = await runChecks({ env: goodEnv({ NODE_USE_ENV_PROXY: undefined }), fetch: fetch as any });
    expect(byName(rs, "node-proxy").status).toBe("FAIL");
    rs = await runChecks({ env: goodEnv({ HTTPS_PROXY: undefined, NODE_USE_ENV_PROXY: undefined }), fetch: fetch as any });
    expect(byName(rs, "node-proxy").status).toBe("SKIP");
    expect(overall(rs)).toBe("PASS");
  });

  it("never prints a secret value in any outcome", async () => {
    const scenarios = [
      goodEnv(),
      goodEnv({ SUPABASE_SERVICE_ROLE_KEY: `"${GOOD_KEY}"` }),
      goodEnv({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt("other") }),
    ];
    for (const env of scenarios) {
      const { fetch } = stubFetch({ supabase: { status: 401 }, notionPage: { status: 401 } });
      const rs = await runChecks({ env, fetch: fetch as any });
      const text = rs.map(formatResult).join("\n") + JSON.stringify(rs) + writeTestParts(rs).join(" · ");
      assertNoSecrets(text);
    }
    const leaky = Object.assign(new Error(`boom Bearer ${NOTION} ${GOOD_KEY}`), {});
    assertNoSecrets(describeNetworkError(leaky));
  });
});

describe("output + write-test line", () => {
  it("one line per check: STATUS id name reason", async () => {
    const { fetch } = stubFetch();
    const rs = await runChecks({ env: goodEnv(), fetch: fetch as any });
    expect(formatResult(rs[0])).toMatch(/^PASS a env-names\s+present: /);
  });
  it("write-test line keeps the page separator: '<CT> · BL3-10 · env check · PASS · …'", async () => {
    const { fetch } = stubFetch();
    const rs = await runChecks({ env: goodEnv(), fetch: fetch as any });
    const line = formatPartsLine(writeTestParts(rs), new Date("2026-11-14T20:00:00Z"));
    expect(line.startsWith("2026-11-14 14:00 CT · BL3-10 · env check · PASS · 7 PASS, 0 FAIL, 0 SKIP")).toBe(true);
  });
  it("noteParts queues under Log; dry-run sends nothing", async () => {
    const out: string[] = [];
    const fetch = vi.fn();
    const sl = createStatusLog({ token: undefined, fetch: fetch as any, out: (l: string) => out.push(l) });
    sl.noteParts(["BL3-10", "env check", "PASS", "x"]);
    const r = await sl.flush();
    expect(r.skipped).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(out[0]).toContain("Log ← ");
    expect(out[0]).toContain(" · BL3-10 · env check · PASS · x");
  });
  it("runbook constants match the issue's checklist", () => {
    expect(REQUIRED_ENV).toEqual(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NOTION_TOKEN", "ANTHROPIC_API_KEY"]);
    expect(EGRESS_HOSTS).toEqual([`${PROJECT_REF}.supabase.co`, "api.notion.com", "api.anthropic.com", "github.com"]);
  });
});
