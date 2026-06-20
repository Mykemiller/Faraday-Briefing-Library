# The Briefing Library — Storefront

A browsable reading room for Faraday's cultivated intelligence — click-to-cart, preview, and
acquire briefings at a flat token price. *"Your unfair advantage."*

Built to the **Briefing Library Storefront — Design Spec & Build Plan v2.0**, capped at a v1.0 of
**100 active briefings**, deployed **flag-gated to a preview route**.

## Stack

Next.js (App Router) · Clerk · Supabase (read-model, wallet, cart, entitlements, preview storage) ·
Airtable (editorial SOR, synced) · Gamma (native export API) · Stripe (existing top-up flow).

## Getting started

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000/library
npm test                     # idempotency + cart-rollback + FTS/facet/keyset
```

## Layout

```
src/
  config/      constants (cap, meter key, flags) — bound, never literal
  lib/         supabase clients, airtable, sync, gamma worker, catalog queries, wallet, meter
               checkout-model.ts / catalog-model.ts — pure references the SQL mirrors (tested)
  store/       cart.ts — Zustand + rollback snapshot buffer
  components/  Shelf (virtualized), Spine, FacetRail, WalletChip, PreviewReader, ReadingChair…
  app/library/ shelf · blueprint · b/[slug] · cart · owned
  app/api/library/ catalog · cart · cart/merge · checkout · sync · preview-worker
  tests/       the three required risk-area suites
supabase/migrations/  read-model, commerce tables, RPCs (+ HELD meter seed)
```

See **CLAUDE.md** for architecture decisions, config constants, and the deploy-gate checklist;
**DEPLOY.md** for the migration set, env vars, feature-flag map, and the build report.
