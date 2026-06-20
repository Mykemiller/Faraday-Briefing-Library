"use client";

/**
 * Token wallet chip (§7.6). Pinned chip showing the live balance from the existing Supabase
 * wallet. The after-checkout figure is a PERSISTENT INLINE STRING — never on hover (L3, §6.5).
 * Reads the wallet; never owns it. Deep-links to the existing top-up flow when short.
 */
export function WalletChip({
  balance,
  cartCost,
  topUpHref = "/wallet/top-up",
}: {
  balance: number | null;
  cartCost: number;
  topUpHref?: string;
}) {
  const after = balance == null ? null : balance - cartCost;
  const short = after != null && after < 0;
  return (
    <div className="font-mono text-sm flex items-center gap-3 bg-cream rounded-sm px-3 py-2 border border-gold/40">
      <span className="text-forest" aria-label={`Wallet balance ${balance ?? "unavailable"} tokens`}>
        {balance == null ? "wallet —" : `${balance} ◉`}
      </span>
      {cartCost > 0 && after != null ? (
        // Persistent inline after-checkout math — always visible, never hover-triggered.
        <span className={short ? "text-gold" : "text-forest/70"} aria-live="polite">
          after checkout: {after} ◉
        </span>
      ) : null}
      {short ? (
        <a href={topUpHref} className="text-gold underline touch-target inline-flex items-center">
          Top up
        </a>
      ) : null}
    </div>
  );
}
