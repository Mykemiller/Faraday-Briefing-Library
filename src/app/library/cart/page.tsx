"use client";

import { useEffect, useMemo, useState } from "react";
import type { CartLine } from "@/lib/types";
import { WalletChip } from "@/components/WalletChip";
import { ReadingChair } from "@/components/ReadingChair";
import { flags } from "@/config/flags";

/**
 * /library/cart — the reading table (§7.5, §9). Lines + running token math + persistent
 * after-checkout balance + checkout CTA. The idempotency token is minted on mount and re-minted
 * whenever the cart structure changes (L2). Short balance disables checkout and deep-links to
 * the existing top-up flow; the cart is preserved (§10).
 */
export default function CartPage() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [meter, setMeter] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [idem, setIdem] = useState<string>(() => crypto.randomUUID());
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/library/cart");
      if (res.ok) setLines((await res.json()).lines ?? []);
    })();
  }, []);

  // Re-mint the idempotency token whenever the cart structure changes (§10.2).
  useEffect(() => {
    setIdem(crypto.randomUUID());
  }, [lines.length]);

  const cost = meter == null ? 0 : lines.length * meter;
  const after = balance == null ? null : balance - cost;
  const short = after != null && after < 0;

  const remove = async (briefingId: string) => {
    setLines((ls) => ls.filter((l) => l.briefingId !== briefingId));
    await fetch("/api/library/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefingId }),
    });
  };

  const checkout = async () => {
    setStatus("Working…");
    const res = await fetch("/api/library/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyToken: idem }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus(`Acquired ${data.owned?.length ?? 0} — ${data.charged} ◉ spent.`);
      setLines([]);
    } else if (data.error === "insufficient_tokens") {
      setStatus("Not enough tokens — top up to continue.");
    } else if (data.error === "commerce_off") {
      setStatus("Checkout opens once the launch gates clear.");
    } else {
      setStatus("Something went wrong — your table is preserved.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-serif font-bold text-2xl text-forest">The Reading Table</h1>
        <WalletChip balance={balance} cartCost={cost} />
      </header>
      <div className="double-rule mt-2 mb-4" />

      {lines.length === 0 ? (
        <div className="py-12 flex flex-col items-center text-center">
          <ReadingChair label="Your table is clear — pull something off the shelf." />
          <a href="/library" className="mt-4 text-gold underline">Browse the shelf</a>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-forest/10">
            {lines.map((l) => (
              <li key={l.briefingId} className="flex items-center justify-between py-3">
                <a href={`/library/b/${l.briefingSlug}`} className="font-serif text-forest">{l.title || l.briefingSlug}</a>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-forest/70">{meter ?? "—"} ◉</span>
                  <button type="button" onClick={() => remove(l.briefingId)} className="touch-target text-forest/60" aria-label={`Remove ${l.title || l.briefingSlug}`}>
                    remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between font-mono">
            <span className="text-forest">Subtotal: {cost} ◉</span>
            {after != null ? <span className="text-forest/70">after checkout: {after} ◉</span> : null}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={checkout}
              disabled={!flags.commerceOn || short || meter == null}
              className="touch-target bg-gold text-forest font-bold rounded-sm px-5 py-2 disabled:opacity-50"
            >
              Check out
            </button>
            {short ? <a href="/wallet/top-up" className="text-gold underline touch-target inline-flex items-center">Top up</a> : null}
          </div>
          {status ? <p className="mt-3 font-mono text-sm text-forest/80" aria-live="polite">{status}</p> : null}
        </>
      )}
    </div>
  );
}
