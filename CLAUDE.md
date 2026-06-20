# CLAUDE.md — Faraday Briefing Library Storefront

The **Briefing Library storefront** — a token-metered reading room for Faraday's cultivated
intelligence, served at `/library`. Built to the *Briefing Library Storefront — Design Spec &
Build Plan v2.0*. Next.js (App Router) · Clerk · Supabase · Stripe · Gamma.

> **Why this repo exists.** The legacy `Mykemiller/Faraday-intelligence` static site is **retired**
> (FAR-119); the live engine is `v0-faraday-daily-challenge`. This storefront was built into its own
> dedicated repo (`Mykemiller/Faraday-Briefing-Library`) by Myke's decision (2026-06-20) to keep it
> cleanly separable until it's wired into the engine.

## Architecture decisions (locked)

- **Read-model + FTS (L1, L7).** Airtable (`appxfti7VuoHYUeu6` / `tbl4kbby85nx6Z891`) is the
  editorial SOR but is **never in the hot path**. A sync mirrors the catalog into the denormalized
  Supabase table `library_catalog_cache`: a generated `tsvector` (title + description) with a GIN
  index for search, GIN-indexed **array columns** for theme/domain/subdomain/company facets, and
  **keyset** pagination on `(go_live_date desc, id desc)` — never offset.
- **Virtualized, section-aware shelf (L5).** `Shelf.tsx` windows rows (TanStack Virtual). Domain
  sections with zero Available briefings **ghost-collapse** to one line.
- **Gamma export + content-addressing (L10).** A worker calls the Gamma **native export API** (PNG)
  and writes to Supabase Storage **content-addressed** by `hash(airtable_record_id +
  gamma_updated_timestamp)`. Re-export is skipped when the hash is unchanged. **No headless browser,
  no new vendor.** Supabase Storage is the SOR for previews; Airtable Attachments is an editorial
  mirror only. Preview shows the hypothesis opener + 1 body slide — **never** the "Faraday's Take"
  or "Sources & methodology" slide. Null previews → full-width description + Reading-Chair graphic.
- **Zustand cart + rollback buffer (Eng 3).** Optimistic mutation → server write → on bounded-retry
  failure, per-item rollback + quiet toast. Persistent + identity-bound in Supabase; survives
  logout/login + device switch; guest cart merges on sign-in (localStorage is courier only).
- **Idempotency ledger (L2).** Checkout is one atomic Postgres transaction (`library_checkout`):
  assert balance ≥ cost → debit wallet → idempotent-upsert entitlements → clear cart lines →
  bump download counter. A session `checkout_idempotency_token` is logged in `processed_checkouts`
  under a unique constraint; a duplicate replays the prior result — no double-debit. Mirrors the
  `wallet_record_grant` / `stripe_events` precedent.
- **Wallet reuse.** Reuses the Jurisdiction Watch wallet — `jw_token_balance(p_sub uuid)` (balance =
  allowance + Σgrants − Σunlocks). The debit is a single `token_transactions` `kind='unlock'` row;
  **no fork of the wallet schema.** Cost binds to `product_meters['briefing_library']` — never a
  literal. Full per-product attribution on `token_transactions` awaits FAR-16.
- **Identity (deviation from spec §9.3, flagged).** Commerce tables key on `public.subscribers(id)`
  (the wallet's identity, resolved by email) rather than `auth.users`, so the JW wallet is reused
  rather than forked. Clerk is the auth front; server routes use the service role with explicit
  ownership checks (RLS is the deny-by-default backstop).

## Config constants (bound, never literal)

`src/config/constants.ts`:
- `BRIEFING_ACTIVE_CAP = 100` — v1.0 cap; V2 raises to 1000 (config, so V2 is tuning not refactor).
- `BRIEFING_METER_KEY = 'briefing_library'` — the meter the cost binds to. **Value lives in Supabase**
  `product_meters`, Myke-governed (FAR-46). The code reads it at runtime (`src/lib/meter.ts`).
- `PREVIEW_SLIDE_MAX = 3` — hypothesis + 1 body; never Take/Sources.
- `SHELF_GHOST_COLLAPSE_RATIO = 0` — empty-shelf collapse threshold (V2 auto-inverts).
- `SHELF_PAGE_SIZE = 48`, `ANON_TEASER_SLIDES = 1`.

Feature flags (`src/config/flags.ts`, all default OFF / preview-only):
`previewRoute`, `subscriberLive` (← FAR-132), `commerceOn` (← FAR-16 + FAR-46), `anonTeaser`.

## Supabase objects (project `ycadmmngkdhvpcsrcuaq`)

Applied: `library_catalog_cache`, `library_cart_items`, `library_entitlements`,
`processed_checkouts` (all RLS-on); functions `library_search`, `library_facets` (search_path-pinned,
SECURITY INVOKER, anon-executable for reads), `library_checkout` (SECURITY DEFINER, **service-role
only**), `current_subscriber_id`. Migrations in `supabase/migrations/`.

**Held — do NOT apply without Myke:** `…_briefing_library_meter_seed.HELD.sql` (seeding a
product-meter is always-human per FAR-56; owned by FAR-46).

## Deploy-gate checklist

| Gate | Unblocks | State |
|---|---|---|
| **FAR-132** Gamma theme normalization | `subscriberLive` flag | ⏳ To Do |
| **FAR-16** wallet generalization | `commerceOn` flag (Phase 3) | ⏳ To Do |
| **FAR-46** meter value sign-off | seed `product_meters['briefing_library']`; flips checkout from `meter_unset` | ⏳ To Do |
| **FAR-56** editorial gate | storefront copy DRAFT → approved | ⏳ |

Nothing flips to subscriber-live or commerce-on without Myke. Deploy to a flag-gated preview route only.

## Commands

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (Vitest: idempotency,
cart-rollback, FTS/facet/keyset). Install uses `--legacy-peer-deps`.
