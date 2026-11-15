# FDY-337 · BL3-04 Responsive layout: evidence

Branch `claude/fdy-337-responsive-layout` · 2026-11-14 CT · ORCH-B Saturday run.

## Change
- `src/components/LibraryShell.tsx`: the content wrapper is `max-w-[1680px]` (was `max-w-[1180px]`), left-aligned next to the 248 px sidebar (no `mx-auto`). Text blocks keep their own max widths (`max-w-[560px]` intro, `max-w-[380px]` search).
- `src/components/Masthead.tsx`: a full-width `<header data-masthead>`. Its inner row uses the content gutters (`px-6 md:px-11`, was `px-8`). The wordmark and the edition slot are `shrink-0` and never wrap; the context line is `min-w-0 truncate`. No `overflow-hidden` on any ancestor.
  - **Side effects (accepted):** at 390 px the masthead gutter goes from 32 to 24 px, which lines it up with the content below. On the Reading Room (`/library/b/[slug]`, content `px-8`), the wordmark now sits 12 px inside the content edge at md+ and 8 px outside it on mobile. These are cosmetic.
- `scripts/ops/layout-check.mjs` (new). See the header comment for usage. At each width it checks:
  - no horizontal scroll (`scrollWidth <= clientWidth`);
  - the masthead and every child of it end at or before `clientWidth`;
  - the sidebar is exactly 248 px at md and wider, and hidden below md;
  - the content column (`main > div`) is at least `min(1680, clientWidth − 248 − gutters) − 2` px wide, and any rendered card grid spans it;
  - one card per row on mobile.

  It exits 1 on any failure and needs Playwright with Chromium (repo dependency, or a global install).

## Results

| Run | 390 | 1280 | 1920 | 2560 |
|---|---|---|---|---|
| **Before**, production `b7cac14` SSR HTML (`--html`) | ok | content 944 ok | **content 1180 < 1582 FAIL** | **content 1180 < 1678 FAIL** |
| **Before**, local build of `main` `b7cac14` (`--via-node`, 12 Available) | PASS | PASS (grid 944) | **FAIL** (grid 1180) | **FAIL** (grid 1180) |
| **After**, local build of this branch | PASS (sidebar hidden, 1 column) | PASS (944) | PASS (1584) | PASS (1680) |
| **After**, preview `dpl_8Zwzkwzr` (`e179c53`) SSR HTML | PASS | PASS (944) | PASS (1584) | PASS (1680) |
| **After**, production (post-merge) | to run | | | |

**Header clipping did not reproduce.** In every run before the change, `scrollWidth == clientWidth` and the masthead's right edge was at or inside the viewport at all four widths. Screenshots: `screens/bl3-04-before-*.png`. The container and header fix shipped anyway, as decided. After the review hardening, layout-check FAILs a page with no `<header>`/`[data-masthead]`. The old masthead had neither (it was a `<div>`), so a re-run against the old build reports `header` FAIL for that reason only. The original "before" run measured that `<div>` and found it unclipped.

Screenshots in `docs/ops/screens/`:
- `bl3-04-before-prod-{390,1280,1920,2560}.png` (production HTML, 0 Available: every section is a closed line)
- `bl3-04-before-local-*.png` (12 Available cards)
- `bl3-04-after-local-*.png`
- `bl3-04-after-preview-*.png`

Local runs use `next start` against a stub PostgREST with synthetic rows in the production shape. This sandbox's Chromium cannot reach loopback or `*.vercel.app`; hence `--via-node`, and the `--html` render of SSR HTML fetched through the Vercel MCP.

Also carried in this PR: `screens/bl3-03-prod-1280.png`, FDY-335's production screenshot, taken after PR #44 merged.

## Tests
`src/tests/bl3-04-responsive-layout.test.ts`:
- class assertions for the wrapper, sidebar and masthead (as class sets);
- `evaluate()` verdicts: 1180 px cap fails; scrollbar-safe `clientWidth`; header child past the edge; mobile one column and hidden sidebar; flag validation.

`npm test` 335/335 · `npx tsc --noEmit` clean · `next build` clean.
