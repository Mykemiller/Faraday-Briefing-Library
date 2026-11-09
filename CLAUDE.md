# CLAUDE.md — Faraday Briefing Library Storefront

The **Briefing Library storefront** — a token-metered reading room for Faraday's cultivated
intelligence, served at `/library`. Built to the *Briefing Library Storefront — Design Spec &
Build Plan v2.0*. Next.js (App Router) · Clerk · Supabase · Stripe · Gamma.

> **Why this repo exists.** The legacy `Mykemiller/Faraday-intelligence` static site is **retired**
> (FAR-119); the live engine is `v0-faraday-daily-challenge`. This storefront was built into its own
> dedicated repo (`Mykemiller/Faraday-Briefing-Library`) by Myke's decision (2026-06-20) to keep it
> cleanly separable until it's wired into the engine.

## Architecture decisions (locked)

- **Canonical home = Supabase `public.briefings` (BL-05 cutover, FDY-171, DEC-IDF-65).** The
  Airtable table (`appxfti7VuoHYUeu6` / `tbl4kbby85nx6Z891`) is **retired**: description marked
  retired, every row retained, never read or written by this app. The one-time migration that moved
  the 436 records is `scripts/migrate-briefings.ts`; its production run is recorded in
  `docs/migration/reconciliation.md` (2026-11-06 section). Editors write `briefings` directly; a
  briefing reaches the shelf only through `status` (`published` ⇒ Available, `planned` ⇒ Coming
  Soon; draft/qa/retired never leak) and the anon SELECT policy on `status='published'`.
- **Read-model + FTS (L1, L7).** `briefings` is **never in the hot path**. The sync route
  (`/api/library/sync` → `src/lib/sync.ts` ← `src/lib/briefings-source.ts`) refreshes the
  denormalized table `library_catalog_cache`: a generated `tsvector` (title + description) with a
  GIN index for search, GIN-indexed **array columns** for theme/domain/subdomain/company facets
  (display NAMES, resolved from `faraday_themes` / `faraday_domains` / `faraday_subdomains` /
  `companies`), and **keyset** pagination on `(go_live_date desc, id desc)` — never offset. The
  cache id is `briefings.airtable_record_id` for migrated rows (slugs, cart lines and
  entitlements stay stable) and `briefings.id` for native rows. The sync writes ONLY the columns
  it owns — `briefing_description`, `canonical_flag`, `gamma_*`, `download_count`,
  `preview_*` are never overwritten (field-map gaps G1/G2/G6 have no `briefings` column yet).
  `briefing_type`/`byline` come from the FDY-181 columns when set, else are derived
  (BL2-01, FDY-277, founder decisions 2026-11-09): `jurisdiction_id` ⇒ `jurisdiction`,
  `company_id`/`institution_id` ⇒ `company`, then IDF placement (subdomain ⇒ thread, domain ⇒
  sector, theme ⇒ theater). Entity keys outrank placement. G3 is closed — the public vocabulary is
  now five types; a row with no key, no placement and no explicit type keeps its existing cache type.
- **Virtualized, section-aware shelf (L5).** `Shelf.tsx` windows rows (TanStack Virtual). Domain
  sections with zero Available briefings **ghost-collapse** to one line.
- **Gamma export + content-addressing (L10).** A worker calls the Gamma **native export API** (PNG)
  and writes to Supabase Storage **content-addressed** by `hash(catalog id +
  gamma_updated_timestamp)`. Re-export is skipped when the hash is unchanged. **No headless browser,
  no new vendor.** Supabase Storage is the SOR for previews (Airtable Attachments were empty at
  migration time and are no longer read). Preview shows the hypothesis opener + 1 body slide — **never** the "Faraday's Take"
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
- **Publishing is Myke's step (BL2-07, FDY-283).** `briefing_signoff` (one row per staged
  version Myke approves) + `v_briefing_signoff_queue` (staged drafts ahead of the live row, with
  G1/G2/G3 verdicts and `approved`) — migration `20261109150000`, additive only. `scripts/publish-batch.mjs`
  promotes (`briefings_version_promote`, which snapshots first) and flips `status='published'` for
  approved rows only; dry run by default, `--apply` to write, one `PUBLISHED` status-log line per
  brief. No runner ever writes a sign-off. Runbook: `docs/ops/publish-batch.md`.
- **Read-only storefront (`storefront/`, BL-12 → BL2-07):** filters are `?type=` (five public
  shelves) · `?tier=` · `?jurisdiction=US-XX|CC` read from `briefings.jurisdiction_id`; no title
  inference. Fixtures render only locally or on a Vercel *preview* that opts in; never production.

## Config constants (bound, never literal)

`src/config/constants.ts`:
- `BRIEFING_ACTIVE_CAP = 100` — v1.0 cap; V2 raises to 1000 (config, so V2 is tuning not refactor).
- `BRIEFING_METER_KEY = 'briefing_library'` — the meter the cost binds to. **Value lives in Supabase**
  `product_meters`, Myke-governed (FAR-46). The code reads it at runtime (`src/lib/meter.ts`).
  **Signed off 2026-06-20: 10 tokens** (status `final`) — a distinct product from `briefing` (=5),
  per Myke's "use 10, not 5." Commerce stays gated on `commerceOn` (← FAR-16) regardless.
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

`…_briefing_library_meter_seed.sql` — **applied 2026-06-20** with Myke's sign-off (10 tokens,
`final`). Was held pending FAR-46; now released. `library_checkout` no longer returns `meter_unset`.

## Deploy-gate checklist

| Gate | Unblocks | State |
|---|---|---|
| **FAR-132** Gamma theme normalization | `subscriberLive` flag | ⏳ To Do |
| **FAR-16** wallet generalization | `commerceOn` flag (Phase 3) | ⏳ To Do |
| **FAR-46** meter value sign-off | seed `product_meters['briefing_library']`; flips checkout from `meter_unset` | ✅ Done 2026-06-20 (10 tokens, `final`) |
| **FAR-56** editorial gate | storefront copy DRAFT → approved | ⏳ |

Nothing flips to subscriber-live or commerce-on without Myke. Deploy to a flag-gated preview route only.

## Commands

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (Vitest: idempotency,
cart-rollback, FTS/facet/keyset). Install uses `--legacy-peer-deps`.

## V2.0 regeneration lanes (BL2-04 / BL2-05)

`scripts/lanes/` drafts briefings from Faraday records and stages them in `briefings_versions`
(kind=draft) — the live `briefings` row is never touched; publishing is a separate human step.
Canon: `docs/ops/lanes.md`. Rules enforced in code: evidence only from `signals` / `artifacts` /
`companies` / `institutions` / `faraday_*` (+ Jurisdiction Watch tables, read-only, for
jurisdiction briefs); every factual sentence carries `[Sn]` resolving to `source_refs`; public
vocabulary only (Theater / Sector / Thread / Signal, never "Key Player"); Profiles carry no Take,
CTA or rating and are flagged thin below 6 Signals; page counts are measured from the PDF and
out-of-range drafts are staged but logged `G1-AUTO · FAIL`. `npm run lanes:samples` regenerates
`docs/briefs/samples/` from the captured fixture evidence.
