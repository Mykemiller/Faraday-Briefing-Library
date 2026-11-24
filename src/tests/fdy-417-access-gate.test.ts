// FDY-417 (ADM-1.7a) — the Briefing Library wiring of the Faraday beta access gate.
// Wrapper policy, the vendored guard end to end (injected fetch, no network), the byte-identity of the
// vendored package, and a render of GatePage in every view grepped for "$" / price-like text.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  LIBRARY_GATE_APP, LIBRARY_GATE_APP_NAME, LIBRARY_GATE_COPY, applyEnforcePolicy, gateConfig, gateEnforced,
  guardLibrary, verifiedClerkEmail,
} from "@/lib/faradayGate";
import { clearGateCache, type GateServerConfig } from "@/lib/faraday-gate/server/check.ts";
import { containsCountClaim, containsPrice, type Entitlement, type GateCopy } from "@/lib/faraday-gate/core.ts";
import type { GuardResult } from "@/lib/faraday-gate/server/guard.ts";
import GatePage from "@/lib/faraday-gate/ui/GatePage.tsx";

const ROOT = path.resolve(__dirname, "../..");
const VENDOR = path.join(ROOT, "src/lib/faraday-gate");
const MASTHEAD = path.join(ROOT, "src/lib/faraday-masthead");
const URL_ = "https://ycadmmngkdhvpcsrcuaq.supabase.co";

function fakeFetch(handler: (url: string, body: Record<string, unknown> | null) => unknown) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    const out = handler(url, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const cfg = (f: typeof fetch): GateServerConfig => ({ supabaseUrl: URL_, serviceKey: "svc", anonKey: "anon", fetchImpl: f });
const missingRpc = () => new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function" }), { status: 404 });
const ent = (e: Partial<Entitlement>): Entitlement => ({ allowed: false, reason: "error", mode: null, role: null, grant_kind: null, expires_at: null, ...e });
const res = (e: Entitlement, view: GuardResult["view"], pass = false): GuardResult => ({ pass, entitlement: e, view, email: null, identitySource: "none" });

describe("FDY-417 · config, enforce flag, Clerk identity", () => {
  it("gateConfig reads this app's existing env names (same pair as supabaseAdmin)", () => {
    const c = gateConfig({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "svc", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" });
    expect(c).toEqual({ supabaseUrl: URL_, serviceKey: "svc", anonKey: "anon" });
    expect(gateConfig({})).toEqual({ supabaseUrl: "", serviceKey: "", anonKey: undefined });
  });

  it('FARADAY_GATE_ENFORCE is on only for the exact string "1"', () => {
    expect(gateEnforced({ FARADAY_GATE_ENFORCE: "1" })).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes", " 1"]) expect(gateEnforced({ FARADAY_GATE_ENFORCE: v }), String(v)).toBe(false);
  });

  it("verifiedClerkEmail trusts only a verified primary address", () => {
    expect(verifiedClerkEmail({ primaryEmailAddress: { emailAddress: "a@b.co", verification: { status: "verified" } } })).toBe("a@b.co");
    expect(verifiedClerkEmail({ primaryEmailAddress: { emailAddress: "a@b.co", verification: { status: "unverified" } } })).toBeNull();
    expect(verifiedClerkEmail({ primaryEmailAddress: { emailAddress: "a@b.co", verification: null } })).toBeNull();
    expect(verifiedClerkEmail({ primaryEmailAddress: { emailAddress: "", verification: { status: "verified" } } })).toBeNull();
    expect(verifiedClerkEmail({ primaryEmailAddress: null })).toBeNull();
    expect(verifiedClerkEmail(null)).toBeNull();
  });
});

describe("FDY-417 · enforce policy", () => {
  it("probe error passes through when enforce is off, closes when on", () => {
    const g = res(ent({ reason: "error" }), "unavailable");
    const soft = applyEnforcePolicy(g, false);
    expect([soft.pass, soft.view, soft.failOpen]).toEqual([true, "pass", true]);
    const hard = applyEnforcePolicy(g, true);
    expect([hard.pass, hard.view, hard.failOpen]).toEqual([false, "unavailable", false]);
  });

  it("real denials are never softened, enforce or not", () => {
    const cases = [["no_grant", "request"], ["expired", "expired"], ["waitlist_mode", "waitlist"], ["unknown_app", "unavailable"], ["revoked", "request"]] as const;
    for (const [reason, view] of cases) {
      for (const enforce of [false, true]) {
        const out = applyEnforcePolicy(res(ent({ reason, mode: "invite" }), view), enforce);
        expect(out.pass, `${reason}/${enforce}`).toBe(false);
        expect(out.failOpen).toBe(false);
      }
    }
  });

  it("a pass stays a pass and is not flagged fail-open", () => {
    const out = applyEnforcePolicy(res(ent({ allowed: true, reason: "open", mode: "open" }), "pass", true), true);
    expect([out.pass, out.failOpen]).toEqual([true, false]);
  });
});

describe("FDY-417 · end to end through the vendored guard (injected fetch)", () => {
  beforeEach(() => clearGateCache());

  it("open mode: one probe for 'briefinglibrary', no identity lookup, pass", async () => {
    const { f, calls } = fakeFetch(() => ({ allowed: true, reason: "open", mode: "open" }));
    const g = await guardLibrary({ cookieHeader: "fgate_at=tok", appEmail: "reader@example.com" }, { cfg: cfg(f), enforce: true });
    expect([g.pass, g.failOpen, g.identitySource]).toEqual([true, false, "none"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/rest\/v1\/rpc\/estate_entitled$/);
    expect(calls[0].body).toEqual({ p_email: null, p_app: LIBRARY_GATE_APP });
  });

  it("RPC missing / erroring → pass through by default", async () => {
    const { f } = fakeFetch(missingRpc);
    const g = await guardLibrary({ cookieHeader: null }, { cfg: cfg(f), enforce: false });
    expect([g.pass, g.failOpen, g.entitlement.reason]).toEqual([true, true, "error"]);
  });

  it("RPC missing with FARADAY_GATE_ENFORCE=1 → closed (unavailable)", async () => {
    const { f } = fakeFetch(missingRpc);
    const g = await guardLibrary({ cookieHeader: null }, { cfg: cfg(f), enforce: true });
    expect([g.pass, g.view]).toEqual([false, "unavailable"]);
  });

  it("no Supabase env at all → error → pass through unless enforced", async () => {
    const empty: GateServerConfig = { supabaseUrl: "", serviceKey: "" };
    expect((await guardLibrary({}, { cfg: empty, enforce: false })).pass).toBe(true);
    expect((await guardLibrary({}, { cfg: empty, enforce: true })).pass).toBe(false);
  });

  it("invite mode, signed out → request view (gate shown)", async () => {
    const { f } = fakeFetch(() => ({ allowed: false, reason: "no_grant", mode: "invite" }));
    const g = await guardLibrary({ cookieHeader: null }, { cfg: cfg(f), enforce: false });
    expect([g.pass, g.view]).toEqual([false, "request"]);
  });

  it("invite mode, Clerk-verified email with a grant → pass, identity from the app (no gate cookie read)", async () => {
    const { f, calls } = fakeFetch((_url, body) =>
      body?.p_email === "reader@example.com"
        ? { allowed: true, reason: "grant", mode: "invite", grant_kind: "demo" }
        : { allowed: false, reason: "no_grant", mode: "invite" });
    const g = await guardLibrary({ cookieHeader: "fgate_at=tok", appEmail: "Reader@Example.com" }, { cfg: cfg(f), enforce: true });
    expect([g.pass, g.email, g.identitySource]).toEqual([true, "reader@example.com", "app"]);
    expect(calls.some((c) => c.url.endsWith("/auth/v1/user"))).toBe(false);
  });

  it("invite mode, no app email, gate cookie with a grant → pass, identity from the gate", async () => {
    const { f } = fakeFetch((url, body) => {
      if (url.endsWith("/auth/v1/user")) return { email: "Reader@Example.com" };
      return body?.p_email ? { allowed: true, reason: "grant", mode: "invite", grant_kind: "demo" } : { allowed: false, reason: "no_grant", mode: "invite" };
    });
    const g = await guardLibrary({ cookieHeader: "other=1; fgate_at=tok", appEmail: null }, { cfg: cfg(f), enforce: true });
    expect([g.pass, g.email, g.identitySource]).toEqual([true, "reader@example.com", "gate"]);
  });

  it("a guard that throws is treated as a probe error (never a crash)", async () => {
    const boom = (async () => { throw new Error("boom"); }) as never;
    expect((await guardLibrary({}, { cfg: gateConfig({}), enforce: false, guard: boom })).pass).toBe(true);
    const closed = await guardLibrary({}, { cfg: gateConfig({}), enforce: true, guard: boom });
    expect([closed.pass, closed.view]).toEqual([false, "unavailable"]);
  });
});

describe("FDY-417 · wiring in the app", () => {
  it("the /library layout runs the guard per request before the masthead and renders GatePage on a denial", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/app/library/layout.tsx"), "utf8");
    expect(src).toContain("noStore()");
    expect(src).toMatch(/guardLibrary\(\{ cookieHeader: headers\(\)\.get\("cookie"\), appEmail: verifiedEmail \}\)/);
    expect(src).toMatch(/if \(!gate\.pass\)[\s\S]*<GatePage[\s\S]*<LibraryMasthead/);
  });

  it("the catch-all route hands every action to the vendored handler with app 'briefinglibrary'", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/app/api/faraday-gate/[action]/route.ts"), "utf8");
    expect(src).toContain("handleGateAction(req, params.action, LIBRARY_GATE_APP, gateConfig())");
    expect(LIBRARY_GATE_APP).toBe("briefinglibrary");
  });
});

describe("FDY-417 · gate copy", () => {
  it("Briefing Library gate copy: right key, no price, no counts", () => {
    expect(LIBRARY_GATE_COPY.access_key).toBe("briefinglibrary");
    const all = [LIBRARY_GATE_COPY.story, ...LIBRARY_GATE_COPY.what_you_get].join("\n");
    expect(containsPrice(all)).toBe(false);
    expect(containsCountClaim(all)).toBe(false);
    expect(["draft", "approved"]).toContain(LIBRARY_GATE_COPY.status);
  });
});

// ── vendored copy is byte-identical to its manifest (and to the canonical package when present) ──
function listFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const manifest = fs.readFileSync(path.join(VENDOR, "MANIFEST.sha256"), "utf8").trim().split("\n").map((l) => {
  const m = l.match(/^([0-9a-f]{64})  (.+)$/);
  if (!m) throw new Error(`bad manifest line: ${l}`);
  return { hash: m[1], file: m[2] };
});
const CANONICAL = process.env.FARADAY_GATE_CANONICAL || path.resolve(ROOT, "../faraday-workbench/packages/faraday-gate");
const hasCanonical = fs.existsSync(path.join(CANONICAL, "core.ts"));

describe("FDY-417 · vendored faraday-gate identity", () => {
  it("matches MANIFEST.sha256 exactly (no edits, no extra or missing files)", () => {
    const onDisk = listFiles(VENDOR).filter((f) => f !== "MANIFEST.sha256").sort();
    expect(onDisk).toEqual(manifest.map((m) => m.file).sort());
    for (const m of manifest) expect(sha(path.join(VENDOR, m.file)), `${m.file} drifted from the manifest`).toBe(m.hash);
    for (const required of ["core.ts", "VERSION", "README.md", "server/check.ts", "server/guard.ts", "server/handlers.ts",
      "server/identity.ts", "server/request.ts", "ui/GatePage.tsx", "ui/gate.html", "gate-copy/briefinglibrary.json"]) {
      expect(manifest.some((m) => m.file === required), `${required} missing from the vendored copy`).toBe(true);
    }
    expect(fs.readFileSync(path.join(VENDOR, "VERSION"), "utf8").trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("GatePage's masthead import resolves to the sibling vendored faraday-masthead", () => {
    const gp = fs.readFileSync(path.join(VENDOR, "ui/GatePage.tsx"), "utf8");
    expect(gp).toContain('from "../../faraday-masthead/ui/Masthead.tsx"');
    expect(fs.existsSync(path.join(MASTHEAD, "ui/Masthead.tsx"))).toBe(true);
  });

  it.skipIf(!hasCanonical)("vendored files are byte-identical to the canonical package", () => {
    expect(fs.readFileSync(path.join(VENDOR, "VERSION"), "utf8")).toBe(fs.readFileSync(path.join(CANONICAL, "VERSION"), "utf8"));
    for (const m of manifest) expect(sha(path.join(CANONICAL, m.file)), `${m.file} differs from canonical: re-vendor`).toBe(m.hash);
  });
});

// ── GatePage render: every view, signed in and out, no "$" or price-like text ────────────────────
describe("FDY-417 · GatePage render", () => {
  const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<link[^>]*>/g, "");
  const fmVersion = fs.readFileSync(path.join(MASTHEAD, "VERSION"), "utf8").trim();

  it("renders every view with no price or $, the commercial line, and the shared masthead", () => {
    for (const view of ["request", "expired", "waitlist", "unavailable"] as const) {
      for (const email of [null, "someone@example.com"]) {
        const html = renderToStaticMarkup(createElement(GatePage, {
          app: LIBRARY_GATE_APP, appName: LIBRARY_GATE_APP_NAME, version: "1.0", copy: LIBRARY_GATE_COPY, view, email,
        }));
        const visible = strip(html);
        expect(visible.includes("$"), `$ in ${view}`).toBe(false);
        expect(/USD|€|£|per month|\/mo\b|tokens?\b/i.test(visible), `price-like text in ${view}`).toBe(false);
        expect(visible).toContain("monthly subscription");
        if (view === "waitlist") expect(visible.includes("Request demo access")).toBe(false);
        if (view !== "unavailable" && view !== "waitlist") expect(visible).toContain("Join the waitlist");
        if (email) expect(visible).toContain(email); else expect(visible).toContain("Sign in");
        expect(html).toContain(`<header class="fm" role="banner" data-fm="${fmVersion}">`);
        expect(html).toContain('<span class="fm-app">Briefing Library</span>');
      }
    }
  });

  it("approved copy renders its story; draft copy would render only the neutral text", () => {
    const approved = renderToStaticMarkup(createElement(GatePage, { app: LIBRARY_GATE_APP, appName: LIBRARY_GATE_APP_NAME, copy: LIBRARY_GATE_COPY, view: "request" }));
    if (LIBRARY_GATE_COPY.status === "approved") expect(approved).toContain(LIBRARY_GATE_COPY.story.slice(0, 40));
    const draft: GateCopy = { ...LIBRARY_GATE_COPY, status: "draft" };
    const html = renderToStaticMarkup(createElement(GatePage, { app: LIBRARY_GATE_APP, appName: LIBRARY_GATE_APP_NAME, copy: draft, view: "request" }));
    expect(html.includes(draft.story.slice(0, 40))).toBe(false);
    expect(html).toContain("Briefing Library is in a private beta.");
  });
});
