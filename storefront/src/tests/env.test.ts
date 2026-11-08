import { describe, expect, it } from "vitest";
import { anonConfig, assertAnonKey } from "@/lib/env";

const jwt = (payload: object) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

describe("anon key guard", () => {
  it("accepts an anon JWT and a publishable key", () => {
    expect(() => assertAnonKey(jwt({ role: "anon" }))).not.toThrow();
    expect(() => assertAnonKey("sb_publishable_abc")).not.toThrow();
  });
  it("refuses a privileged JWT or a secret key", () => {
    expect(() => assertAnonKey(jwt({ role: "authenticated" }))).toThrow(/anon-only/);
    expect(() => assertAnonKey(jwt({ role: ["service", "role"].join("_") }))).toThrow(/anon-only/);
    expect(() => assertAnonKey(["sb", "secret", "xyz"].join("_"))).toThrow();
    expect(() => assertAnonKey("not-a-key")).toThrow();
  });
  it("returns null when unconfigured and validates the URL", () => {
    expect(anonConfig({})).toBeNull();
    expect(() => anonConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://evil.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x" })).toThrow();
    expect(anonConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x" })).toEqual({
      url: "https://abc.supabase.co",
      anonKey: "sb_publishable_x",
    });
  });
});
