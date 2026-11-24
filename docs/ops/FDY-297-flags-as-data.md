# FDY-297 (ADM-2.4) — Library flags as data

**What:** the `NEXT_PUBLIC_LIBRARY_*` flags are read from the Faraday config store (`v_effective_config`, app
`BL`) on the server, through `src/lib/config/resolver.ts` (a copy of the FDY-295 reference resolver contract:
60 s cache, 4 s timeout, fail closed, service key server-only).

| Env var (fallback) | Setting key | Status | Read in |
|---|---|---|---|
| `NEXT_PUBLIC_LIBRARY_COMMERCE_ON` (code default `false`) | `library_commerce_on` | enforced | `src/app/api/library/checkout/route.ts`; the cart button via `GET /api/library/flags` |
| `NEXT_PUBLIC_LIBRARY_ANON_TEASER` (code default `true`) | `library_anon_teaser` | enforced | `src/app/library/b/[slug]/page.tsx` |
| `NEXT_PUBLIC_LIBRARY_PREVIEW_ROUTE` (code default `true`) | `library_preview_route` | recorded_only | no reader in the code |
| `NEXT_PUBLIC_LIBRARY_SUBSCRIBER_LIVE` (code default `false`) | `library_subscriber_live` | recorded_only | no reader in the code |

**Rule (per flag):** a value somebody set in the console wins. The env value is used when the read fails, times
out, returns a malformed row, the key is unknown, the value has the wrong type, or nobody has set a value (the
definition default). So deploying this, or applying the migration, changes nothing until a value is set.

**Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `GAMMA_API_KEY`, `CRON_SECRET`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) stay in env and are never read, logged or returned by the resolver. Logs carry
the app code, a reason code and setting keys only.

**Tests:** `src/tests/fdy297-config-resolver.test.ts`, `src/tests/fdy297-live-flags.test.ts`.
