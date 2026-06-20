import { describe, it, expect } from "vitest";
import { checkout, type WalletWorld } from "@/lib/checkout-model";

function world(over: Partial<WalletWorld> = {}): WalletWorld {
  return {
    meter: 10,
    balance: 100,
    cart: ["recA", "recB"],
    entitlements: new Set(),
    ledger: new Map(),
    debits: [],
    ...over,
  };
}

describe("checkout idempotency / no double-debit (L2, §10.2)", () => {
  it("debits exactly cart-size × meter once", () => {
    const w = world();
    const r = checkout(w, "tok-1");
    expect(r.charged).toBe(20); // 2 lines × 10
    expect(r.balance).toBe(80);
    expect(w.debits).toEqual([20]);
    expect([...w.entitlements]).toEqual(["recA", "recB"]);
  });

  it("replays the prior result on a duplicate token — no second debit (retry/double-tap)", () => {
    const w = world();
    const first = checkout(w, "tok-dup");
    const replay = checkout(w, "tok-dup");
    expect(replay.replayed).toBe(true);
    expect(replay.charged).toBe(20);
    expect(replay.balance).toBe(80);
    expect(w.debits).toEqual([20]); // still only one debit
    expect(w.balance).toBe(80);
  });

  it("binds cost to the meter, not a literal (meter change flows through)", () => {
    const r = checkout(world({ meter: 7 }), "tok-2");
    expect(r.charged).toBe(14);
  });

  it("refuses to checkout when the meter is unset (FAR-46 pending)", () => {
    const r = checkout(world({ meter: null }), "tok-3");
    expect(r.error).toBe("meter_unset");
  });

  it("blocks on insufficient balance and leaves the wallet untouched", () => {
    const w = world({ balance: 5 });
    const r = checkout(w, "tok-4");
    expect(r.error).toBe("insufficient_tokens");
    expect(w.debits).toEqual([]);
    expect(w.balance).toBe(5);
  });

  it("drops already-owned lines and charges only the acquirable remainder", () => {
    const w = world({ entitlements: new Set(["recA"]) });
    const r = checkout(w, "tok-5");
    expect(r.owned).toEqual(["recB"]);
    expect(r.charged).toBe(10);
  });

  it("is replay-safe across many retries of the same token", () => {
    const w = world();
    const results = Array.from({ length: 25 }, () => checkout(w, "tok-storm"));
    expect(w.debits).toEqual([20]); // exactly one debit despite 25 attempts
    expect(results.filter((r) => r.replayed).length).toBe(24);
  });
});
