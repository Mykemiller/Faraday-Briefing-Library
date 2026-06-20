# Briefing Library Storefront (v1.0) — flag-gated preview build

Implements *Briefing Library Storefront — Design Spec & Build Plan v2.0*. Replaces the `/library`
stub with a token-metered, Airtable-wired reading-room storefront, built to a v1.0 cap of **100
active briefings** and deployed **behind feature flags on a preview route**. Jira epic: **FAR-133**.

## What's here
- **Catalog (Phase 0):** Supabase read-model `library_catalog_cache` (tsvector+GIN FTS, GIN array
  facets, keyset pagination); Airtable→Supabase sync; live facet counts.
- **Shelf + Blueprint + detail (Phases 1–2):** virtualized search-first shelf with ghost-collapse;
  `/library/blueprint`; detail with ≤3 content-addressed preview slides (never Take/Sources) +
  preview-missing fallback; Gamma native-export worker (content-addressed PNGs, no headless browser).
- **Commerce (Phase 3):** persistent Zustand cart with rollback buffer + guest merge; atomic,
  idempotent `library_checkout` (processed_checkouts ledger); reuses the JW wallet; owned full-read.
- **Cross-cutting (Phase 4):** brand tokens, reading-chair states, Faraday's-Take + double-rule,
  iPad-first / no hover-only, a11y patterns.

## Safety / gates
- Flags default **OFF**: `subscriberLive` (← FAR-132), `commerceOn` (← FAR-16 + FAR-46). Preview route only.
- Meter is **not** seeded in code (always-human, FAR-46); checkout returns `meter_unset` until set.
- `library_checkout` is SECURITY DEFINER, **service-role only**; all new tables RLS-on.
- Storefront copy is **DRAFT** pending the FAR-56 editorial gate.

## Verification
- `npm test` → 17 passing (idempotency / cart-rollback / FTS+facet+keyset). `npm run typecheck` clean.
- Supabase migrations applied + advisor-hardened (search_path, execute revokes). See `DEPLOY.md`.

## Reviewer notes (flagged deviations)
- Commerce tables key on `public.subscribers(id)` (the reused wallet's identity) rather than spec
  §9.3's `auth.users` — to reuse the JW wallet, not fork it.
- Open canon flags (posture, Blueprint naming, taxonomy counts, meter, teaser depth) are **surfaced,
  not resolved** — see `DEPLOY.md` §7.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
