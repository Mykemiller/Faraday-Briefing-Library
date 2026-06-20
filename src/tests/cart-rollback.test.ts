import { describe, it, expect, vi } from "vitest";
import { createCartStore } from "@/store/cart";
import type { CartServer } from "@/store/cart";

const line = (id: string) => ({ briefingId: id, briefingSlug: `${id}-slug`, title: id, addedAt: "" });

describe("cart optimistic rollback (§9.2, Eng 3)", () => {
  it("keeps an added line when the server write succeeds", async () => {
    const server: CartServer = { add: vi.fn().mockResolvedValue(undefined), remove: vi.fn() };
    const store = createCartStore({ server, retries: 2, backoffMs: 0 });
    await store.getState().add(line("recA"));
    expect(store.getState().lines.map((l) => l.briefingId)).toEqual(["recA"]);
    expect(store.getState().pending).toHaveLength(0);
    expect(store.getState().toast).toBeNull();
  });

  it("rolls the specific item back after bounded retry exhausts, with a quiet toast", async () => {
    const add = vi.fn().mockRejectedValue(new Error("network"));
    const store = createCartStore({ server: { add, remove: vi.fn() }, retries: 2, backoffMs: 0 });
    await store.getState().add(line("recBad"));
    // optimistic insert was reverted; only the failed item is gone
    expect(store.getState().lines).toHaveLength(0);
    expect(add).toHaveBeenCalledTimes(3); // initial + 2 retries (bounded window)
    expect(store.getState().toast).toMatch(/couldn’t add/i);
    expect(store.getState().pending).toHaveLength(0);
  });

  it("only rolls back the failed item, preserving a concurrently-added good item", async () => {
    const add = vi.fn(async (l: { briefingId: string }) => {
      if (l.briefingId === "recBad") throw new Error("network");
    });
    const store = createCartStore({ server: { add, remove: vi.fn() }, retries: 0, backoffMs: 0 });
    await Promise.all([store.getState().add(line("recGood")), store.getState().add(line("recBad"))]);
    expect(store.getState().lines.map((l) => l.briefingId)).toEqual(["recGood"]);
  });

  it("restores a removed line if the delete write fails", async () => {
    const store = createCartStore({
      server: { add: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockRejectedValue(new Error("network")) },
      retries: 0,
      backoffMs: 0,
    });
    store.getState().hydrate([line("recKeep")]);
    await store.getState().remove("recKeep");
    expect(store.getState().lines.map((l) => l.briefingId)).toEqual(["recKeep"]);
    expect(store.getState().toast).toMatch(/restored/i);
  });

  it("does not add duplicate lines (unique-constraint mirror, §9.3)", async () => {
    const store = createCartStore({ server: { add: vi.fn().mockResolvedValue(undefined), remove: vi.fn() }, backoffMs: 0 });
    await store.getState().add(line("recDup"));
    await store.getState().add(line("recDup"));
    expect(store.getState().lines).toHaveLength(1);
  });
});
