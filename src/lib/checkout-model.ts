/**
 * Reference implementation of the checkout invariant, mirroring the library_checkout SQL RPC
 * (migration 20260620000300). The PRODUCTION path is the Postgres function (atomic in one
 * transaction); this pure model exists so the no-double-debit / replay-safety contract is unit
 * tested deterministically (Quality §5 risk area 1).
 */

export interface WalletWorld {
  meter: number | null; // product_meters['briefing_library'].tokens_cost
  balance: number; // jw_token_balance(p_sub)
  cart: string[]; // acquirable briefing ids (Owned/retired already dropped)
  entitlements: Set<string>;
  ledger: Map<string, CheckoutResult>; // processed_checkouts by idempotency token
  debits: number[]; // every wallet 'unlock' row written (for assertions)
}

export interface CheckoutResult {
  ok?: boolean;
  error?: string;
  charged?: number;
  owned?: string[];
  balance?: number;
  meter?: number;
  cost?: number;
  replayed?: boolean;
}

export function checkout(world: WalletWorld, idempotencyToken: string): CheckoutResult {
  // 1. Replay-safety: a duplicate token serves the stored result, never re-debits (L2).
  const prior = world.ledger.get(idempotencyToken);
  if (prior) return { ...prior, replayed: true };

  // 2. Meter is config, never a literal (§8). Unset ⇒ commerce stays off.
  if (world.meter == null) return { error: "meter_unset" };

  // 3. Validate cart (Owned lines dropped here, mirroring the RPC's NOT EXISTS join).
  const lines = world.cart.filter((id) => !world.entitlements.has(id));
  if (lines.length === 0) return { error: "empty_cart", balance: world.balance };

  // 4. Cost = lines × meter; assert balance.
  const cost = lines.length * world.meter;
  if (world.balance < cost) return { error: "insufficient_tokens", cost, balance: world.balance, meter: world.meter };

  // 5. Atomic: debit once, idempotent-grant entitlements, clear lines.
  world.debits.push(cost);
  world.balance -= cost;
  for (const id of lines) world.entitlements.add(id);
  world.cart = world.cart.filter((id) => !lines.includes(id));

  const result: CheckoutResult = { ok: true, charged: cost, owned: lines, balance: world.balance, meter: world.meter };
  // 6. Log under the unique token.
  world.ledger.set(idempotencyToken, result);
  return result;
}
