# Logo asset set — BL-11 (FDY-177)

Files:

- `sources.csv` — every in-scope source: `source_id, name, entity_type, tier`.
- `logo-register.csv` — one row per source: `source_id, logo_url, licence_terms, terms_url,
  usage_restriction, status, reason, research_depth`. `status` is `approved` or `excluded`. No row is pending.
- `../../assets/logos/` — approved logo files only (currently none).

## Scope decision

A "tracked source" is each distinct `entity_id` in `docs/briefs/entity-universe.csv` with
`entity_type` = `company` or `institution` and a counted tier (`Deep`, `Standard`, `Profile`).
The 357 `coming_soon` rows are out of scope. That gives **200 sources**: 45 Deep, 15 Standard,
140 Profile (150 companies, 50 institutions). CBRE, JLL, Uptime Institute and iMasons appear
twice, once as a company and once as an institution, because the universe gives them two
entity_ids; each is registered separately.

Themes (7), domains (23) and sub-domains (117) are Faraday's own taxonomy. They have no
third-party logo, so they are left out of both files.

## Approval rule

A logo is `approved` only if the owner's own brand, press or media-kit page (or an equivalent
official source) states terms that permit reuse in a publication, and that page was read and its
URL recorded. Trademark notices, Wikimedia Commons public-domain tags and third-party logo
aggregators (logotyp.us, logokit, companieslogo, cdnlogo, lobehub, etc.) do not count. When in
doubt, the row is excluded. Only approved logos are downloaded.

## Result: 0 approved, 200 excluded, 200 total

- **45 Deep-tier sources were researched.** Each was searched for an official brand, press or
  trademark page. Findings and the terms URL are in `licence_terms` / `terms_url`; where a page
  could not be fetched, the text says it is a search-engine summary and was not read directly.
- **155 Standard and Profile sources were not reviewed** and say so (`research_depth = not_reviewed`).
  Each one's main domain was probed and the agent proxy refused the connection, so their terms
  could not have been read from this environment anyway.

Why nothing was approved:

1. **Egress.** From this environment the agent proxy refused the connection to the domain of 197
   of the 200 sources (probed 2026-10-13). Only anthropic.com and microsoft.com were reachable,
   and oracle.com answered HTTP 403. Owner terms could not be read and logos could not be
   downloaded from owner sites. Per the task rules these rows are
   `excluded — terms unverifiable (fetch blocked)`.
2. **The terms that were found mostly forbid it.** Microsoft, Apple, Intel, Dell, Oracle, NVIDIA,
   KKR, Brookfield, Anthropic, Meta and OpenAI all require a licence, written permission or prior
   approval for logo use. AMD's download licence covers only sellers of AMD-based products.

## Leads worth a human follow-up

These look like the owner may permit editorial use. Each still needs the terms page read
directly and the file downloaded from the owner's own site before the row can change to `approved`:

- **Equinix** — Press Resource Center (https://brand.equinix.com/press-kit) reportedly says
  assets "may be used for publication as long as proper credit is given to Equinix as the source".
- **ERCOT** — media kit (https://www.ercot.com/news/mediakit/logos) reportedly allows editorial
  use in trade publications, but the logo is sent on email request, not downloaded.
- **Nscale** — official media kit with logo downloads (https://nscale.com/media-kit); no
  publication licence was seen.
- **Siemens** — press terms allow editorial use with a "Siemens AG" credit, but they were found
  for press photos, not for the logo.
