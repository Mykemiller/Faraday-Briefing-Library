# Build Report & Deploy Guide — Briefing Library Storefront (v1.0)

Generated 2026-06-20. Implements *Briefing Library Storefront — Design Spec & Build Plan v2.0*.

## 1. Branch + PR

- **Repo:** `Mykemiller/Faraday-Briefing-Library` (new, dedicated — Myke's decision 2026-06-20).
- **Branch:** `claude/briefing-library-storefront-26ajrm`
- **PR:** open as **draft** (see `PR_DESCRIPTION.md`).

### GitHub push set (everything under repo root)
```
package.json  package-lock.json  tsconfig.json  next.config.mjs  vercel.json
postcss.config.mjs  tailwind.config.ts  .gitignore  .env.example
README.md  CLAUDE.md  DEPLOY.md  PR_DESCRIPTION.md
supabase/migrations/  (4 files: catalog cache, commerce, rpcs, HELD meter seed)
src/config/  src/lib/  src/store/  src/components/  src/app/  src/tests/  src/middleware.ts
```

## 2. Supabase migrations

Project `ycadmmngkdhvpcsrcuaq`. **Applied** (additive, RLS-on, dormant behind flags):

| Migration | Objects |
|---|---|
| `…000100_library_catalog_cache` | `library_catalog_cache` + tsvector/GIN, array-facet GIN, keyset index; RLS read policy |
| `…000200_library_commerce` | `library_cart_items`, `library_entitlements`, `processed_checkouts`; RLS owner policies; `current_subscriber_id()` |
| `…000300_library_rpcs` | `library_search`, `library_facets`, `library_checkout`; checkout locked to service-role |
| `…000400_…meter_seed` | **Applied 2026-06-20** — Myke sign-off (FAR-46): `briefing_library` = **10**, status `final` |

Post-apply hardening also applied: `search_path` pinned on all functions; `library_checkout`
execute revoked from `public/anon/authenticated`, granted to `service_role`.

**Verified live:** 3 commerce tables present, 4 functions present, `library_checkout` →
`meter_unset` (gate works), `library_search`/`library_facets` run clean on the empty cache.

### Env vars the deploy needs
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_STORAGE_BUCKET` (create bucket `library-previews`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_BRIEFINGS_TABLE_ID`,
`GAMMA_API_KEY`, `CRON_SECRET`, and the four `NEXT_PUBLIC_LIBRARY_*` flags.

## 3. Feature-flag map

| Flag | Default | Flips when |
|---|---|---|
| `NEXT_PUBLIC_LIBRARY_PREVIEW_ROUTE` | `true` (preview-only) | stays on preview route until launch |
| `NEXT_PUBLIC_LIBRARY_SUBSCRIBER_LIVE` | **`false`** | **FAR-132** lands (theme normalization) |
| `NEXT_PUBLIC_LIBRARY_COMMERCE_ON` | **`false`** | **FAR-16** (wallet) lands — FAR-46 (meter) ✅ done |
| `NEXT_PUBLIC_LIBRARY_ANON_TEASER` | `true` | per §18 flag #6 (Myke) |

## 4. Deploy-gate checklist

| Gate | State | Unblocks |
|---|---|---|
| FAR-132 — Gamma theme normalization | ⏳ To Do | subscriber-live |
| FAR-16 — wallet generalization | ⏳ To Do | commerce-on (Phase 3) |
| FAR-46 — meter value sign-off | ✅ Done 2026-06-20 | seeded `briefing_library` = **10** (`final`); checkout now prices acquisitions |
| FAR-56 — editorial gate | ⏳ | storefront copy DRAFT → approved |

## 5. Test results

`npm test` → **17 passed** (3 files). `npm run typecheck` → **clean**.
- `checkout-idempotency.test.ts` (7) — exact debit, replay-safe duplicate token, meter-bound cost,
  insufficient-balance block, owned-line drop, 25× retry storm = one debit.
- `cart-rollback.test.ts` (5) — success keeps line; bounded-retry failure rolls back the item + toast;
  concurrent good item preserved; failed delete restores line; no duplicate lines.
- `catalog-query.test.ts` (5) — FTS AND-match, facet intersection, Available-only facet counts,
  keyset pagination without overlap/gaps, most-downloaded sort.

**a11y:** patterns implemented per §13 (AA pairings, keyboard path + gold focus rings, alt text
`"<title>, preview slide N of M"`, non-colour-only status, `prefers-reduced-motion`, 44px targets,
no hover-only affordances). ⏳ Automated axe-core pass to run in CI once the app is deployed to the
preview URL (not runnable headless here without a browser — kept out of scope per the no-Puppeteer
boundary; use Vercel preview + axe browser extension or `@axe-core/cli` against the preview URL).

## 6. Write-back confirmations

- **Jira:** epic **FAR-133**; stories **FAR-134…FAR-142**; dependency comment on FAR-133; links
  FAR-132/FAR-16/FAR-46 *Blocks* FAR-133, FAR-133 *Relates* FAR-28. No statuses transitioned.
- **Notion:** child status page under the Brand Bible —
  https://app.notion.com/p/38589a0c168081fdb30fe3c972e10928 (canon untouched; status appended).
- **CLAUDE.md:** added (architecture decisions, config constants, Supabase objects, deploy-gate
  checklist).

## 7. Open questions for Myke (spec §18 canon flags)

1. **Build target / repo** — confirmed `Faraday-Briefing-Library`. It is **not yet in this session's
   GitHub scope**, so the branch/PR couldn't be pushed from here — add the repo to the session (or
   take the push set) to land it.
2. ~~**Meter value**~~ — ✅ **Resolved 2026-06-20: 10 tokens** (distinct product from `briefing`=5).
   Seeded `final`; FAR-46 closed.
3. ~~**Identity model**~~ — ✅ **Confirmed 2026-06-20: reuse the Jurisdiction Watch wallet.** Commerce
   keys on `subscribers(id)` (wallet identity), Clerk→subscribers via email bridge. No fork.
4. **Posture shift** to a destination; **Intelligence Blueprint** net-new naming → **design session
   scheduled** (see §8). Taxonomy counts (18/30/7 vs 23/116 vs 59), access tiering, anonymous teaser
   depth, preview-slide rule, bundles, SEO gateway — all on that session's agenda (§18).

## 8. Intelligence Blueprint design session

Scheduled (interactive) to resolve the §18 canon cluster that the build surfaced but couldn't decide
in code: posture (destination vs outbound), Blueprint naming/scope, taxonomy reconciliation, access
tiering, teaser depth, preview-slide rule, bundles/SEO. **Scheduled: today 2026-06-20, 09:00–10:00 CT**
(per Myke). Calendar invite + Meet link pending Myke's approval of the calendar-write permission
prompt; agenda mirrors §7.4 above. Decisions land back in the Brand Bible (append-only) + Jira.

### Pre-existing security note (not introduced by this build)
Supabase advisor flags **6 Jurisdiction Watch tables with RLS disabled** (`jurisdictions`,
`jps_history`, `jurisdiction_signals`, `briefing_links`, `jw_watchlists`, `jw_watchlist_items`) —
fully exposed to anon/authenticated. Surfaced for Myke; **not** auto-remediated (enabling RLS without
policies would break JW). Separate from this storefront's tables (which are RLS-on).
