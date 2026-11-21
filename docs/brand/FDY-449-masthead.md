# FDY-449 · BRAND-1e — Faraday masthead on the Briefing Library

2026-11-21. Workstream CC-BRAND-MASTHEAD-1.0. Package source: Faraday-Workbench PR #55
(`packages/faraday-masthead` v1.0.0, FDY-444).

## What changed
- **Vendored** `faraday-masthead` 1.0.0 into `src/lib/faraday-masthead/` (all files: VERSION, MANIFEST.json,
  check-drift.mjs, static/, scripts/, test/). `src/lib/` because this repo keeps every lib there and the `@/`
  alias points at `src/`. `node src/lib/faraday-masthead/check-drift.mjs` → "matches its manifest". No
  vendored file edited.
- **Drift check in CI:** the repo has no `.github/workflows`, so the check is wired into `npm test`
  (`node src/lib/faraday-masthead/check-drift.mjs && vitest run`; Vercel/any CI running `npm test` fails on drift)
  and also asserted by `src/tests/fdy-449-masthead.test.ts`. `npm run test:masthead` runs the package's own node test.
- **One layout for every /library page:** `src/app/library/layout.tsx` renders `<LibraryMasthead>` = the shared
  `<Masthead appName="Briefing Library" homeHref="/library">` + `<LibraryAppBar>`. Covers the shelf, the Reading
  Room (`/library/b/[slug]`), the reading table (`/library/cart`), My Briefings (`/library/owned`, the account
  page) and the Blueprint. Rewrites (`/`, `/b/:slug`, `/cart`, `/owned`, `/blueprint`) land on the same pages, so
  the canonical host gets it too. Layouts add no routes; `next.config.mjs` untouched.
- **Old header removed:** `src/components/Masthead.tsx` and its `FMark.tsx` are deleted (no double bars).
- **AppBar:** "The Shelf" (`/library`, current on `/` and `/library`) and "Faraday Intelligence"
  (`https://faraday-intelligence.ai` — the old wordmark's link target, kept now that the shared wordmark links to
  the Library's own home). The edition line ("November 2026 · Shelf Edition") moved from the old masthead's right
  slot into the AppBar (right-aligned, hidden below md as before). Shelf nav (Theaters sidebar, type chips, search)
  stays in the page.
- **Skip link:** each page owns `<main id="main">` (shelf: LibraryShell's existing `<main>`; the reader's and the
  legacy pages' root wrappers became `<main>`). `min-h` offsets updated 69 → 117 px (68 px masthead + 49 px AppBar).
- **Signed-in state:** `viewerEmail()` in `src/lib/viewer.ts` reads the same Clerk session `viewerSubscriberId`
  already reads (try/catch → null). No auth mechanism change.
- **Fonts:** the app self-hosts the three families under next/font generated names, so `globals.css` aliases
  "IBM Plex Serif" / "Bricolage Grotesque" / "IBM Plex Mono" to the same OFL files (no Google Fonts request;
  `loadFonts` off). Verified in the browser: `document.fonts.check('600 22px "IBM Plex Serif"')` = true.
- **tsconfig:** `allowImportingTsExtensions: true` (noEmit was already on) so the vendored `../core.ts` import
  type-checks. No bundler change needed; `next build` is clean.

## Not changed (DON'T list)
Shelf data reads, catalog/reader/cart/checkout code, publish scripts, briefing content, routing/rewrites/basePath.
`storefront/` is excluded: it is the older BL-12 app on Vercel `faraday-briefing-library-storefront` with SSO
protection `all` (docs/ops/FDY-398-public-url.md §2), so it serves no subscriber pages.

## Results
| Check | Result |
|---|---|
| `npm test` (drift + vitest) | 30 files / 362 tests pass (main: 29 / 355; +7 new in `fdy-449-masthead.test.ts`, bl3-04 masthead case rewritten) |
| `npm run test:masthead` | pass (package's own node tests, 0 fail) |
| `npm run typecheck` | 0 errors |
| `npm run build` | pass |
| `npm run lint` | not configured in this repo (no ESLint config or dependency; same on main) |
| FDY-337 `scripts/ops/layout-check.mjs` vs local build, 380/1280/1920/2560 | PASS all 4 (overflow, header, sidebar 248 px, grid 944/1584/1680 px) |
| Playwright metrics (shelf, briefing @380/1280/2560; owned @1280) | scrollWidth = clientWidth; wordmark centre offset 0 px; header 68 px (60 px at 380); AppBar 49 px, no internal overflow |

Local run: `next start` against a scratch mock PostgREST (Supabase is blocked here) with fixture rows shaped like
`src/tests/fixtures/reader-fixture.ts`, and a dummy Clerk key (signed out → "Sign in").

## Screenshots (`docs/brand/`)
`FDY-449-shelf-{380,1280,2560}[-top].png`, `FDY-449-briefing-{380,1280,2560}[-top].png`,
`FDY-449-owned-1280[-top].png` (deviceScaleFactor 1; `-top` = top 300 px clip).

## Decisions
1. Vendor path `src/lib/faraday-masthead/` (repo convention), not `lib/`.
2. Drift check via `npm test` + a vitest assertion — there is no workflow file to extend.
3. Masthead in a `library/layout.tsx` rather than per page, so every /library page gets exactly one.
4. AppBar holds only The Shelf + Faraday Intelligence; cart/owned/blueprint stay out of nav (pricing and checkout
   are out of scope until commerce-on, FAR-16; "Intelligence Blueprint" naming unsigned).
5. `signInHref="/library/owned"`: no sign-in route exists (Clerk runs as middleware only), so "Sign in" goes to the
   Library's account page (My Briefings), as Jurisdiction Watch uses `/account`. Revisit when a Clerk sign-in page lands.
6. Context slot is "Briefing Library" on every page (the old reader said "Briefing Reading Room").
