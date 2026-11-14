import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { briefingSlug } from "@/lib/slug";
import { readerWorld, EMAIL, SUB, PUBLISHED_ID, PLANNED_ID } from "./fixtures/reader-fixture";

/**
 * BL3-11 (FDY-338) integration: ReserveButton → cart API → checkout API → entitlement row →
 * the reader unlocks. Supabase (service role) and Clerk are stubbed; the published briefing is a
 * test-only fixture (decision 6). The live reserve on production is Myke's (PR Human actions).
 */

const state = vi.hoisted(() => ({
  world: null as null | ReturnType<typeof import("./fixtures/reader-fixture").readerWorld>,
  userId: null as string | null,
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => state.world!.client }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  currentUser: async () => (state.userId ? { primaryEmailAddress: { emailAddress: EMAIL } } : null),
}));
vi.mock("@/config/flags", () => ({
  flags: { previewRoute: true, subscriberLive: false, commerceOn: true, anonTeaser: true },
}));

const { POST: cartPost, GET: cartGet } = await import("@/app/api/library/cart/route");
const { POST: checkoutPost } = await import("@/app/api/library/checkout/route");
const { default: ReaderPage } = await import("@/app/library/b/[slug]/page");
const { getReaderBriefing } = await import("@/lib/catalog");

const PUB_SLUG = briefingSlug("Wolfspeed", PUBLISHED_ID);
const SOON_SLUG = briefingSlug("Coming Soon — Nutanix", PLANNED_ID);

async function renderPage(slug: string): Promise<string> {
  return renderToStaticMarkup(await ReaderPage({ params: { slug } }));
}

const json = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  state.world = readerWorld();
  state.userId = null;
});

describe("BL3-11 reader page (fixture-backed)", () => {
  it("anonymous on an Available brief: thesis, first section, Reserve; nothing past section one", async () => {
    const out = await renderPage(PUB_SLUG);
    expect(out).toContain("The Hypothesis");
    expect(out).toContain("substrate lead outlasts");
    expect(out).toContain("Wolfspeed restructured its debt");
    expect(out).toContain("Select this Briefing");
    expect(out).toContain("Last refreshed Nov 12, 2026");
    expect(out).toContain("Byline · Gilbert");
    expect(out).not.toContain("SECOND-SECTION-MARKER");
    expect(out).not.toContain("TAKE-MARKER");
    expect(out).not.toContain('data-testid="sources-table"');
    expect(out).not.toContain("Cover sentence");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("Coming Soon: a not-yet-published page, no manuscript, no preview, no Reserve", async () => {
    const out = await renderPage(SOON_SLUG);
    expect(out).toContain("This Briefing is not yet published.");
    expect(out).not.toContain("PLANNED-MANUSCRIPT-MARKER");
    expect(out).not.toContain("Select this Briefing");
    expect(out).not.toContain('aria-label="Preview"');
  });

  it("Available without manuscript_md: the existing preview, no Sources table", async () => {
    state.world!.tables.briefings[0].manuscript_md = null;
    const out = await renderPage(PUB_SLUG);
    expect(out).toContain('aria-label="Preview"');
    expect(out).toContain("The rest of the Briefing is waiting.");
    expect(out).toContain("Select this Briefing");
    expect(out).not.toContain('data-testid="sources-table"');
    expect(out).not.toContain("Wolfspeed restructured its debt");
  });

  it("an unknown slug is a 404", async () => {
    await expect(renderPage("no-such-brief-000000")).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});

describe("BL3-11 reserve flow: cart → checkout → entitlement → reader unlocks", () => {
  it("unlocks the full manuscript and Sources table for the buyer", async () => {
    state.userId = "user_clerk_1";

    // Signed in but not yet an owner: teaser.
    expect((await getReaderBriefing(PUB_SLUG, SUB))!.briefing.owned).toBe(false);
    expect(await renderPage(PUB_SLUG)).not.toContain("SECOND-SECTION-MARKER");

    // ReserveButton → POST /api/library/cart (what reservedStore's member server.add sends).
    const add = await cartPost(json({ briefingId: PUBLISHED_ID, briefingSlug: PUB_SLUG }));
    expect(add.status).toBe(200);
    const cart = await (await cartGet()).json();
    expect(cart.lines.map((l: { briefingId: string }) => l.briefingId)).toEqual([PUBLISHED_ID]);

    // Checkout → library_checkout RPC → entitlement row; the cart line is consumed.
    const token = "5f0c6a3e-8f7b-4d2a-9c1e-2b3a4c5d6e7f";
    const res = await checkoutPost(json({ idempotencyToken: token }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, owned: [PUBLISHED_ID] });
    expect(state.world!.tables.library_entitlements).toEqual([
      { subscriber_id: SUB, briefing_id: PUBLISHED_ID, source: "checkout" },
    ]);
    expect(state.world!.tables.library_cart_items).toEqual([]);

    // A replayed token does not grant twice.
    const replay = await checkoutPost(json({ idempotencyToken: token }));
    expect((await replay.json()).replayed).toBe(true);
    expect(state.world!.tables.library_entitlements).toHaveLength(1);

    // The reader unlocks.
    const out = await renderPage(PUB_SLUG);
    expect(out).toContain("SECOND-SECTION-MARKER");
    expect(out).toContain("TAKE-MARKER");
    expect(out).toContain('data-testid="sources-table"');
    expect(out).toContain("Restructuring filing");
    expect(out).toContain("In your library");
    expect(out).not.toContain("Select this Briefing");
    expect(out).not.toContain("The rest of the Briefing is waiting.");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("anonymous cart and checkout calls are refused (401)", async () => {
    expect((await cartPost(json({ briefingId: PUBLISHED_ID, briefingSlug: PUB_SLUG }))).status).toBe(401);
    expect((await checkoutPost(json({ idempotencyToken: "5f0c6a3e-8f7b-4d2a-9c1e-2b3a4c5d6e7f" }))).status).toBe(401);
    expect(state.world!.tables.library_entitlements).toEqual([]);
  });

  it("a Coming Soon brief cannot be acquired: checkout grants nothing", async () => {
    state.userId = "user_clerk_1";
    await cartPost(json({ briefingId: PLANNED_ID, briefingSlug: SOON_SLUG }));
    const res = await checkoutPost(json({ idempotencyToken: "6f0c6a3e-8f7b-4d2a-9c1e-2b3a4c5d6e7f" }));
    expect(res.status).toBe(409);
    expect(state.world!.tables.library_entitlements).toEqual([]);
    expect(await renderPage(SOON_SLUG)).not.toContain("PLANNED-MANUSCRIPT-MARKER");
  });
});
