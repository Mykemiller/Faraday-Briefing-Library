# Briefing Library — read-only storefront (BL-12 / FDY-178)

A draft, read-only storefront for published Briefing Library briefings. It is its own Next.js app
and its own Vercel project, with **Root Directory = `storefront`**. It is separate from the
token-metered reading room at the repo root, which uses service-role server routes. This app
must never use those routes.

## What it reads, and how

- **One table, one policy.** `public.briefings`, via the BL-03 policy
  `briefings_anon_select_published` (anon may SELECT rows where `status = 'published'`; anon has
  no INSERT/UPDATE/DELETE grant). The app also sends `status=eq.published` on every request, so
  the filter holds even if the policy is ever widened.
- **Anon key only.** `src/lib/env.ts` accepts a `sb_publishable_…` key or a JWT whose `role` is
  exactly `anon`, and throws on anything else before any request is made.
- **GET only, no client library.** `src/lib/briefings.ts` is the only data access: plain `fetch`
  GET against PostgREST with an explicit column list (never `*`). There is no Supabase client,
  no query builder, no route handlers and no server actions.
- **Cached 5 minutes** (`next.revalidate = 300`); pages render per request so that filters are
  URL state.

## Guard test

`src/tests/read-only-guard.test.ts` scans every source file in `storefront/`. It fails on:
- any reference to the service-role key, or a secret key;
- any Supabase client import;
- `.insert/.update/.upsert/.delete/.rpc/.upload/.remove(`;
- a non-GET method, or a write `Prefer` header;
- `"use server"`;
- a `route.ts` handler.

It also asserts that `lib/briefings.ts` is the only file that calls `fetch`, and that it sends
GET with `status=eq.published`.

## Logos (BL-11)

`scripts/sync-entity-register.mjs` runs before `dev`, `build` and `test`. It reads
`docs/assets/sources.csv` and `docs/assets/logo-register.csv` and writes
`src/generated/entities.json`. A logo is used **only** when its register row is `approved` and
`assets/logos/<source_id>.svg|png` exists. Every other entity shows its text name. Today the
register has **0 approved of 200**, so every entity is text. A missing register fails the build:
it never falls back to showing everything.

## Pages

| Route | Content |
|---|---|
| `/` | Published briefings, newest first (`published_at desc`, then `id`). Filter by tier (`?tier=deep\|standard\|profile`) and US state (`?state=TX`). Separate empty states for "nothing published" and "nothing matches". |
| `/b/[id]` | One published briefing: eyebrow (tier · pages · type), title, facts, thesis, contents, sources & methodology. Non-UUID or unpublished ids return 404. |
| error | A failed read shows "could not be reached" with a retry. It never pretends the shelf is empty. |

**State filter caveat.** `briefings` has no state column. A briefing's state is read from its
title (a full state name, or ", XX" after a place) in `inferState()`, which is unit-tested. The
menu only offers states that exist. Replace it with the real column when one lands.

## Local

```bash
cp .env.example .env.local     # set the anon/publishable key
npm install
npm run dev                    # http://localhost:3000
STOREFRONT_FIXTURES=1 npm run dev      # sample rows, to review the populated layout
STOREFRONT_FIXTURES=empty npm run dev  # the zero-row state (what production shows today)
npm test && npm run typecheck && npm run build
```

Fixtures are refused when `VERCEL=1` or `NODE_ENV=production` (tested), and every page shows a
"Sample data" banner while they are on.

## Brand

Brand Bible V2, using the root app's tokens. Paper `#F8F5F0` (never pure white), Faraday Forest
and Gold, the forest-over-gold double rule, IBM Plex Serif for display, Bricolage Grotesque for
UI and IBM Plex Mono for metadata. Two tokens are darkened for WCAG AA on paper: `gold-ink`
#8A6416 (4.9:1) for small gold text, and `warm-gray` #736A61 (4.9:1). The public vocabulary
applies: internal D-codes and type keys never render. Draft: `noindex` meta tag and
`X-Robots-Tag` header.

Screens for review are in `docs/review/` (rendered from local fixtures, apart from the empty and
unavailable states).
