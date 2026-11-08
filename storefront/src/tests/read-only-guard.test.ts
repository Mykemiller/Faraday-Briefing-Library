/**
 * BL-12 read-only guard. Fails the build if storefront code:
 *  - references the Supabase service-role key (env name or the bare `service_role` string), or
 *  - calls any write method (supabase-js insert/update/upsert/delete/rpc, storage writes), or
 *  - sends a non-GET HTTP method, or
 *  - imports a Supabase client at all (the storefront reads PostgREST over plain GET).
 * It scans every source file under storefront/ except node_modules, build output and this
 * test file's own pattern table.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".vercel", "generated", "public"]);
const SELF = resolve(__filename);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name) && p !== SELF && name !== "package-lock.json") out.push(p);
  }
  return out;
}

const FORBIDDEN: { rule: string; re: RegExp }[] = [
  { rule: "service-role key env var", re: /SERVICE_ROLE/i },
  { rule: "service_role string", re: /service[_-]?role/i },
  { rule: "Supabase secret key", re: /sb_secret_/ },
  { rule: "supabase-js client import", re: /@supabase\/(supabase-js|ssr|postgrest-js)/ },
  { rule: "createClient", re: /\bcreateClient\s*\(/ },
  { rule: ".insert(", re: /\.insert\s*\(/ },
  { rule: ".update(", re: /\.update\s*\(/ },
  { rule: ".upsert(", re: /\.upsert\s*\(/ },
  { rule: ".delete(", re: /\.delete\s*\(/ },
  { rule: ".rpc(", re: /\.rpc\s*\(/ },
  { rule: ".upload(", re: /\.upload\s*\(/ },
  { rule: ".remove(", re: /\.remove\s*\(/ },
  { rule: "non-GET HTTP method", re: /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i },
  { rule: "Prefer: return= (write header)", re: /return=(representation|minimal)/ },
  { rule: "server action", re: /["']use server["']/ },
];

const files = walk(ROOT);

describe("storefront is read-only", () => {
  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThan(15);
    expect(files.some((f) => f.endsWith(join("lib", "briefings.ts")))).toBe(true);
  });

  for (const { rule, re } of FORBIDDEN) {
    it(`has no ${rule}`, () => {
      const hits = files
        .map((f) => ({ f, src: readFileSync(f, "utf8") }))
        .filter(({ src }) => re.test(src))
        .map(({ f }) => relative(ROOT, f));
      expect(hits, `forbidden pattern "${rule}" found in: ${hits.join(", ")}`).toEqual([]);
    });
  }

  it("has no API route handlers (nothing that could accept a write)", () => {
    const routes = files.filter((f) => /[\\/]route\.(ts|js)$/.test(f));
    expect(routes.map((f) => relative(ROOT, f))).toEqual([]);
  });

  it("the only fetch in the app is a GET with status=eq.published", () => {
    const fetchers = files.filter((f) => /\bfetch\s*\(/.test(readFileSync(f, "utf8")));
    expect(fetchers.map((f) => relative(ROOT, f))).toEqual([join("src", "lib", "briefings.ts")]);
    const src = readFileSync(fetchers[0], "utf8");
    expect(src).toMatch(/method:\s*"GET"/);
    expect(src).toMatch(/"status",\s*"eq\.published"/);
  });

  it("the pattern table actually catches violations", () => {
    const bad = [
      "process.env.SUPABASE_SERVICE_ROLE_KEY",
      "supabase.from('briefings').insert({})",
      "await sb.from('x').update({a:1})",
      "fetch(u, { method: 'POST' })",
      "import { createClient } from '@supabase/supabase-js'",
    ];
    for (const s of bad) expect(FORBIDDEN.some(({ re }) => re.test(s)), s).toBe(true);
  });
});
