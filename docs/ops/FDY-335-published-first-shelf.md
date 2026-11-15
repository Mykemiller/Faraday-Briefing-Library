# FDY-335 · BL3-03 Published-first shelf: evidence

Branch `claude/fdy-335-published-first-shelf` · 2026-11-14 CT · ORCH-B Saturday run.

## What the shelf does now

| Rule | Where |
|---|---|
| Each type section renders Available briefs first as full cards: go_live_date (published_at date) desc, then id desc, the keyset order | `src/lib/shelf-sections.ts` `buildShelfSections` |
| Planned/draft rows sit inside one native `<details>` per section, closed by default; the summary text is exactly `N in production` (singular `1 in production`) | `src/components/Shelf.tsx`, `inProductionLabel` in `src/lib/brand.ts` |
| N is the count of non-Available rows of that type across **every** row the active query matches, not just the loaded page | `inProductionByType(filterRows(...))` in `src/lib/catalog.ts` → `ShelfPage.inProductionByType` |
| A section with 0 Available shows only its `N in production` line | `Shelf.tsx` |
| Opening a line (by hand or through decision 4) loads that type's planned rows A–Z from `/api/library/catalog?type=<t>&status=Coming Soon&sort=az`. The A–Z sort is keyset-paged with a cursor of the form `az:<title>\|<id>`. The line shows exactly that contiguous A–Z run, plus "Show more in production" while fewer than N are loaded | `LibraryShell.tsx` `loadPlanned`, `mergePlannedRuns`; `compareAz` in `src/lib/catalog-model.ts` |
| "More from the shelf" shows only while Available rows remain to load (Available rows sort before planned rows in the keyset) | `hasMoreAvailable` |
| Planned cards carry a small mono "Coming soon" badge; Available cards carry none. The "Coming Soon —" prefix is stripped at render time as well as in the data layer | `Spine.tsx`, `stripComingSoon` (moved to `brand.ts`, re-exported by `shelf-map.ts`) |
| An active search or Theater filter (the one the current page was fetched with) opens every line; the Reserved overlay never shows lines | `LibraryShell.tsx` |
| Retired rows never load (BL3-01 `loadShelf` selects published + planned only); 0/0 shows the existing empty state | unchanged, tested |

## Evidence

### Tests
`npm test` → 304/304 (19 in `src/tests/bl3-03-published-first-shelf.test.ts`). `npx tsc --noEmit` is clean. `next build` is clean.

### Preview (real data), deployment `dpl_7jgu3izq…` (c110e3e) and `dpl_4HvH3bEH…` (89d5dac)
`/library` was fetched through the Vercel MCP: this sandbox's egress blocks `*.vercel.app`, so a direct curl or Playwright run is not possible. It returned 200 with five sections, each showing only its line: **6 / 23 / 59 / 267 / 45 in production** (= the 400 planned rows; 0 published). No `<details>` is open, no title contains "Coming Soon —", and the 48 page-1 planned cards are all badged and inside closed lines.
`/api/library/catalog?type=theater&status=Coming Soon&sort=az` returned all 6 Theater rows A–Z, with `nextCursor: null` and `inProductionByType: {theater: 6}`.

Screenshot `screens/bl3-03-preview-1280.png`: the preview's server-rendered HTML rendered in local Chromium at 1280 px, using this branch's built CSS and fonts. The before state, from production on main `0a8f03c`, is `screens/bl3-03-prod-before-1280.png`: one Company section with a 48-card wall of grey placeholders.

### Interactive (local `next start`, JS hydrated)
Chromium in this sandbox cannot reach the Faraday REST API or loopback, so the app ran against a local PostgREST stand-in. It was seeded with synthetic rows that have the production shape: 6 / 23 / 59 / 267 / 45 planned, every fifth title carrying the raw "Coming Soon — " prefix, plus one retired row. Requests were bridged through Playwright `page.route`. Results at 1280 px:

| Check | Result |
|---|---|
| Lines at load | 5, all closed; "More from the shelf" absent |
| Open Theater | 6 cards, A–Z, 6 badges, no "Show more" |
| Open Company | 48 cards A–Z, then "Show more in production" → 96 cards, still A–Z, 96 unique |
| "Coming Soon —" visible anywhere | no |
| Company open, then the "Company" chip (filter change) | line stays open and reloads: 48 cards = the first 48 A–Z (contiguous run, not page rows) |
| Search "Wolfspeed" | only Company remains: "18 in production", opened automatically, 18 cards |
| Reserved Briefings | no lines |

Screenshots: `screens/bl3-03-local-expanded-1280.png` (Company open), `screens/bl3-03-local-search-1280.png` (search) and `screens/bl3-03-local-with-available-1280.png` (7 Available rows seeded: cards first, then each line).

### Production
Production evidence is collected after Myke merges. The checks: the production deployment on the merge SHA, `/library` → 200, the 1280 px screenshot `screens/bl3-03-prod-*.png`, and the assertion that each section shows cards or `N in production` and no "Coming Soon —".

## Found, not changed
- **`/library` Supabase reads land in Next's Data Cache.** In a local `next start`, the page's supabase-js fetches were written to `.next/cache/fetch-cache` and served stale after the underlying rows changed: 0 Available rendered while `/api/library/catalog` returned 7. Only clearing the cache fixed it. `export const dynamic = "force-dynamic"` alone did not stop it. On Vercel the Data Cache persists, so production `/library` could lag `briefings` after a publish (BL3-12). Suggested fix (separate issue): `export const fetchCache = "force-no-store"` on `/library`, the reader route and `/api/library/catalog`, or `cache: "no-store"` on the admin client's fetch.
