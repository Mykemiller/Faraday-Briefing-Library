# FDY-398 · BL3-14 — Public Briefing Library URL

2026-11-20 CT. Evidence and the engine-side change for pointing
`https://www.faraday-intelligence.ai/briefing-library` at the BL3 storefront.

## 1. Finding: who serves www.faraday-intelligence.ai

Checked with the Vercel MCP in team Project Foundry (`team_JS3rgFwySt8w8yds7fAh1KeM`):

| Item | Value |
|---|---|
| Vercel project | `v0-faraday-daily-challenge-n2u5` (`prj_A7MhvdAWivMLOccGMTp6AFYZQ1s1`) |
| Domains on it | `www.faraday-intelligence.ai` (primary), `faraday-intelligence.ai` (308 to www), faradaydailychallenge.com, faraday-player.com |
| Repo | `Mykemiller/v0-faraday-daily-challenge`, production branch `main` |
| Latest production deploy | `dpl_PrYnz69geAHu7qqmHjLJHqtG7kyw`, commit `a723a50` (PR #218) |

This matches FAR-119: the engine project serves the whole marketing site, so the July
"Shelf Edition" page at `/briefing-library` is a route in that repo.

## 2. Decision 1: the canonical app

The **root app** of this repo (Vercel project `faraday-briefing-library`,
`prj_67udxme2On5WHJEn2SGDzMv53OdQ`) is canonical. It is the only app with both the BL3-03
published-first shelf (`src/components/Shelf.tsx`) and the BL3-11 reader
(`src/app/library/b/[slug]`). Its production `/library` already shows the five types (Theater,
Sector, Thread, Company, Jurisdiction), the "N in production" lines, and no "Key Player".

`storefront/` (Vercel `faraday-briefing-library-storefront`) is the older read-only BL-12
surface. Its SSO protection is set to `all`, so it cannot serve a public custom domain.
`faraday-briefing-library` uses SSO `all_except_custom_domains`, so the custom domain is public.

## 3. What changed in this repo

* `next.config.mjs`: internal rewrites `/` → `/library`, `/b/:slug` → `/library/b/:slug`,
  plus `/cart`, `/owned`, `/blueprint`. The subdomain therefore answers at its root, and the
  engine's `/briefing-library/:path*` redirect lands on real pages. The `/library/*` routes keep
  working on every host.
* `src/app/page.tsx` is deleted. It held a redirect to `/library`, and a page at `/` would take
  precedence over the rewrite.
* Decision 4, noindex: added an `X-Robots-Tag: noindex, nofollow` header and
  `robots: { index: false, follow: false }` metadata, both with a `TODO(FDY-340)`. Remove them
  once BL3-12 has published at least 10 briefs.
* `src/tests/bl3-14-public-url.test.ts` has 4 tests covering the rewrites and noindex.
* **Fonts self-hosted** (`src/app/fonts/`, `next/font/local`, OFL). Both Vercel builds of the
  first commit failed inside `next/font/google` (`loader.js:112`, "Cannot read properties of null
  (reading '1')"). The build region now receives extension-less Google font URLs, which Next 14.2
  cannot parse. The failure is outside this diff and would hit any fresh build of `main`. The
  families, weights, styles and CSS variables are unchanged (latin subset).
* No new env vars. Clerk's production key works on a subdomain of its primary domain, and no
  code reads a site-URL variable.

## 4. Domain attach (Decision 5) — done

`library.faraday-intelligence.ai` was attached to `faraday-briefing-library` via the Vercel
MCP on 2026-11-20 at 01:08 CT, and Vercel reports it `verified: true`. The apex is on Vercel
DNS, so no external DNS edit is needed. It serves the current production deployment now, and it
will pick up the rewrites when this PR is merged.

## 4b. Preview verification (dpl_EW1rBw2s8jAZFLqs7JQjbexWF6Hd, commit e7cd9ef)

| Request | Result |
|---|---|
| `/` | 200, the BL3 shelf (Theater/Sector/Thread/Company/Jurisdiction sections, "N in production"), 0 "Key Player", `x-robots-tag: noindex, nofollow` |
| `/b/hvdc-th-hvdc` | `x-matched-path: /library/b/[slug]` (rewrite reaches the reader). It returns 404 from the reader's own `notFound()` because the brief is unpublished, which matches current production at `/library/b/hvdc-th-hvdc`. |
| Live subdomain before merge, `library.faraday-intelligence.ai/library` | 200, BL3 shelf, 0 "Key Player" (fetched from Postgres `http`, since container egress is blocked) |
| `www.faraday-intelligence.ai/briefing-library` | still the July shelf: 3 "Key Player", "Loading the shelf". This clears with §5. |

## 5. Engine-side change (Mykemiller/v0-faraday-daily-challenge)

This session could not attach that repo (the `add_repo` call was refused), so the change
is written out here for the next session or for Myke.

**5a. Redirect (Decision 2).** Add to `next.config.*` → `async redirects()`:

```js
{ source: "/briefing-library", destination: "https://library.faraday-intelligence.ai/", permanent: true },
{ source: "/briefing-library/:path*", destination: "https://library.faraday-intelligence.ai/:path*", permanent: true },
```

`permanent: true` returns a 308. Do not use an external `rewrites()` proxy, because it breaks
`/_next` assets.

**5b. Delete the legacy shelf (Decision 3).** Remove the route that renders `/briefing-library`
(e.g. `app/briefing-library/**`) and everything only it uses: the Key Player nav item and type
chip, the client-side data loader that shows "Loading the shelf…", and the "Coming Soon —"
title prefixing. To find all of it:

```bash
grep -rnE "Shelf Edition|Key Player|Loading the shelf|briefing-library" --include=*.ts --include=*.tsx --include=*.js .
```

Keep any links elsewhere on the site that point at `/briefing-library`, because the redirect
serves them. Then run `npm test`, run the typecheck, and open a draft PR.

## 6. Production check (after both PRs merge)

```bash
curl -sI https://www.faraday-intelligence.ai/briefing-library | grep -iE '^(HTTP|location)'
#   HTTP/2 308 · location: https://library.faraday-intelligence.ai/
curl -s https://library.faraday-intelligence.ai/ | grep -c "The Briefing Library"   # > 0
curl -s https://library.faraday-intelligence.ai/ | grep -c "Key Player"             # 0
curl -sI https://library.faraday-intelligence.ai/ | grep -i x-robots-tag            # noindex, nofollow
```

Reader links (BL3-11): every card links to `/library/b/<slug>`, which resolves on the
subdomain. `/b/<slug>` also resolves through the rewrite.

## 7. Production check after PR #48 merged (2026-11-20 01:24 CT)

Production deploy `dpl_Gf11HuyZBtxcTQq6zTM2AFYEdyZm` (main `d909149`), fetched from Postgres `http`:

| Request | Result |
|---|---|
| `library.faraday-intelligence.ai/` | **PASS**: 200, `x-matched-path: /library`, five types, 0 "Key Player", `x-robots-tag: noindex, nofollow` |
| `library.faraday-intelligence.ai/b/hvdc-th-hvdc` | **PASS** (routing): `x-matched-path: /library/b/[slug]`. It returns 404 only because the brief is unpublished (FDY-340). |
| `www.faraday-intelligence.ai/briefing-library` | **pending §5**: still the July shelf (3 "Key Player", "Loading the shelf"), with no 308 yet |
