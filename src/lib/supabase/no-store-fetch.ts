/**
 * fetch for every server-side supabase-js client: forces `cache: "no-store"` so Next's Data Cache
 * (`.next/cache/fetch-cache`, persistent on Vercel) never stores or replays a Supabase read.
 *
 * Why (FDY fetch-cache fix, 2026-11-14): Next 14.2 caches GET fetches in a page that does no
 * dynamic work (no cookies()/headers()/auth()) even with `dynamic = "force-dynamic"` — the export
 * forces a dynamic render but does not set the fetch revalidate to 0. `/library` and
 * `/library/blueprint` were serving the first render's rows indefinitely after `briefings`
 * changed. Setting it here covers every read, current and future, without per-route exports.
 *
 * `fetch` is resolved at call time so Next's patched global fetch is the one that sees the option.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });
