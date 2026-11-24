import { describe, it, expect, vi, beforeEach } from "vitest";

// FDY-297: the Library flags read as data, falling back to the NEXT_PUBLIC_LIBRARY_* env values.
const env = vi.hoisted(() => ({ commerceOn: false, anonTeaser: true }));
vi.mock("@/config/flags", () => ({
  flags: {
    previewRoute: true,
    subscriberLive: false,
    get commerceOn() { return env.commerceOn; },
    get anonTeaser() { return env.anonTeaser; },
  },
}));

const { getLibraryFlags, LIBRARY_SETTING_SPECS } = await import("@/config/live-flags");
const { createResolver } = await import("@/lib/config/resolver");

const URL = "https://ycadmmngkdhvpcsrcuaq.supabase.co";
const row = (key: string, value: unknown, source = "setting") =>
  ({ app_code: "BL", scope: "default", key, value, source, is_default: source === "default" });
const resolverWith = (rows: unknown, ok = true) =>
  createResolver({ url: URL, key: "test-key", client: async () => ({ ok, json: async () => rows }) });

beforeEach(() => { env.commerceOn = false; env.anonTeaser = true; vi.spyOn(console, "warn").mockImplementation(() => {}); });

describe("FDY-297 Library flags", () => {
  it("maps the env flags to BL setting keys", () => {
    expect(LIBRARY_SETTING_SPECS.commerceOn.key).toBe("library_commerce_on");
    expect(LIBRARY_SETTING_SPECS.anonTeaser.key).toBe("library_anon_teaser");
  });

  it("uses values set in the console", async () => {
    const f = await getLibraryFlags(resolverWith([row("library_commerce_on", true), row("library_anon_teaser", false)]));
    expect(f).toEqual({ commerceOn: true, anonTeaser: false });
  });

  it("keeps the env values when the read fails (commerce cannot turn on by itself)", async () => {
    env.commerceOn = false;
    expect(await getLibraryFlags(resolverWith([], false))).toEqual({ commerceOn: false, anonTeaser: true });
    env.commerceOn = true;
    expect((await getLibraryFlags(resolverWith([], false))).commerceOn).toBe(true);
  });

  it("keeps the env values when nobody has set a value (definition defaults)", async () => {
    env.anonTeaser = false;
    const f = await getLibraryFlags(resolverWith([row("library_commerce_on", true, "default"), row("library_anon_teaser", true, "default")]));
    expect(f).toEqual({ commerceOn: false, anonTeaser: false });
  });

  it("with no service key in the environment, the default resolver falls back to env", async () => {
    const f = await getLibraryFlags();
    expect(f).toEqual({ commerceOn: false, anonTeaser: true });
  });
});
