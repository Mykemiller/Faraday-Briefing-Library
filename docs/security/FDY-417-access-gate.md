# FDY-417 · ADM-1.7a · Beta access gate on the Briefing Library

Follow-up to FDY-414. Wires the shared Faraday gate (faraday-gate 1.1.0) to `estate_entitled(p_email, 'briefinglibrary')`.

## Registry (read-only SELECT, 2026-11-24)
`app_registry` row: code `BL`, Briefing Library v3.5, vercel_project `faraday-briefing-library`,
access_key `briefinglibrary`, **gate_mode `open`** (unchanged by this PR). `estate_entitled(text,text)` exists.

## What runs where
| Path | Gated? |
|---|---|
| `/library`, `/library/b/[slug]`, `/library/cart`, `/library/owned`, `/library/blueprint` | yes, via `src/app/library/layout.tsx` |
| `/`, `/b/:slug`, `/cart`, `/owned`, `/blueprint` (next.config rewrites to the pages above) | yes (same layout) |
| `/api/library/*` (catalog, cart, checkout, sync cron, preview-worker cron) | no (unchanged; cart/checkout keep their Clerk checks, crons keep CRON_SECRET) |
| `/api/faraday-gate/[action]` | public by design (the gate's own code / verify / request / signout) |

## Behaviour
- Mode `open`: one cached probe (60 s per instance, 2 s timeout), no identity lookup, page renders exactly as before.
- Probe error (RPC missing, timeout, no env): passes through unless `FARADAY_GATE_ENFORCE === "1"`.
- Other modes: identity = Clerk primary email **only when Clerk reports it verified**, else the gate's
  own `fgate_at` one-time-code cookie. A denial renders the vendored `GatePage` (shared masthead, no prices).
- Config uses existing env names: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (code sign-in only). No new secret.

## Tests
`src/tests/fdy-417-access-gate.test.ts` (Vitest, 22): wrapper/enforce policy, guard end to end with an
injected fetch, layout + route wiring, gate copy price/count guard, manifest identity (and canonical
identity when `../faraday-workbench` or `FARADAY_GATE_CANONICAL` is on disk), GatePage render in all
views grepped for `$` / price-like text.
