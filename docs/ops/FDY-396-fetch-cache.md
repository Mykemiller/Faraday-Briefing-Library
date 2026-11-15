# FDY-396 — `/library` served stale `briefings` rows from Next's Data Cache

2026-11-14. Next 14.2.33, @supabase/supabase-js 2.108.2. Found while verifying FDY-335 (PR #44).

## Root cause
`export const dynamic = "force-dynamic"` only sets `staticGenerationStore.forceDynamic`
(`next/dist/server/app-render/create-component-tree.js`). It never sets the store's
`revalidate` to 0. In `next/dist/server/lib/patch-fetch.js`, a GET fetch with no `cache` option
in a page that makes no dynamic API call (`cookies()`, `headers()`, Clerk `auth()`) therefore
reaches the **"auto cache"** branch and gets `revalidate = false`, meaning it is cached for good.
The `Authorization`-header path ("auto no cache") doesn't help, because it only fires when the
store's `revalidate === 0`. Cache keys are URL + headers, so a cached shelf read is also shared
across routes. Next keeps an in-memory copy as well: deleting `.next/cache/fetch-cache` without
restarting still served the stale rows.

| Route | Before the fix | Why |
|---|---|---|
| `/library` | **stale** | no dynamic API call → every supabase read cached |
| `/library/blueprint` | **stale** | same; also uses the anon `supabaseServer()` client |
| `/library/b/[slug]` | fresh | calls Clerk `auth()` → `revalidate 0` → authed fetches not cached |
| `/api/library/catalog` | fresh | route handler reading the request → dynamic |
| `/library/owned` | n/a | makes no Supabase read yet |

## Fix
`src/lib/supabase/no-store-fetch.ts`: `noStoreFetch` adds `cache: "no-store"` to every request.
Both `supabaseAdmin()` and `supabaseServer()` pass it as `global.fetch`, so every server-side read
is covered, now and later, without per-route exports. Guard: `src/tests/supabase-no-store.test.ts`
runs a real supabase-js query through each client against a stubbed `fetch` (it fails on `main`).

## Repro (local `next start`, stub PostgREST on :54321, 3 rows, fresh `.next/cache`)
Probe: count of stub requests per `/library` load, and the statuses in the RSC payload.

Before (main @ 0a8f03c):
```
load1 all planned        : stub-requests=8 Available=0 ComingSoon=3
load2 1,2 published      : stub-requests=0 Available=0 ComingSoon=3    <- stale
  /api/library/catalog: available=2 comingSoon=1                       <- API is fresh
blueprint load: stub-requests=1                                        <- shelf reads came from cache
fetch-cache entries: 9
load3 after rm fetch-cache: stub-requests=0 Available=0 ComingSoon=3   <- in-memory copy still served
```
After (this branch):
```
load1 all planned        : stub-requests=8 Available=0 ComingSoon=3
load2 1,2 published      : stub-requests=8 Available=2 ComingSoon=1
load3 only 1 published   : stub-requests=8 Available=1 ComingSoon=2
blueprint load: stub-requests=7
reader load: stub-requests=7
fetch-cache entries: 0
```

## Production note
Deploying this build replaces the Data Cache entries the old build wrote. The new code never reads
them because every fetch is `no-store`, so no manual cache purge is needed.
