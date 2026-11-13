# Review-chain fixtures (BL2-06, FDY-282)

Everything `node scripts/review/run.mjs --dry-run` reads when no Supabase environment is present.
Built from the **seven BL2-05 sample briefs** (`docs/briefs/samples/*.md`, FDY-281) and the evidence
packs the lane runner composed them from (`scripts/lanes/fixtures/evidence/<briefing>.json`).
Regenerate with `npm run review:fixtures` whenever the samples change.

| File | What it is | How it was made |
|---|---|---|
| `drafts.json` | Seven `briefings_versions` drafts, one per lane (theaters · domains · subdomains · companies · institutions · states · countries). `contents[0]` is the manuscript (Markdown exactly as staged by the BL2-05 runner), `source_refs` the numbered citation list, `generator_measured_pages` the page count the runner recorded. | `build.mjs` — parses each sample's header comment (briefing id, tier, measured pages, source count) and its ```` ```json source_refs ```` block. |
| `briefings.json` | The parent `briefings` rows the lane runner used (`scripts/lanes/fixtures/briefings.json`), so `version`, `tier`, `briefing_type`, entity keys and sector match what G2 preset selection reads. | `build.mjs` |
| `briefing_lanes.json` | The seven lane rows (quota 3, cursors as staged). | `build.mjs` |
| `briefing_reviews.prior.json` | One prior `G1-AUTO · FAIL` on Texas v1 (the BL2-04 stub), so a v2 FAIL would be the second consecutive and exercise the PARKED path. | `build.mjs` |
| `sources.json` | For every `source_refs` entry (187 URLs), **the Faraday record text the generator composed from** — a signal's `framing` + `faradays_take`, the signal's artifact summary/title, an artifact's summary/title, the JW/company/institution record rendered flat, PUC/permit event fields, moratorium fields — keyed by the raw url and by its normalised form when distinct, with `title`, `published_at` and the record dates. This is what G1's number check and Reviewer A are given: the record, not a re-fetch. | `build.mjs` (`recordFor`) |
| `reviews.sample.json` | The 21 review rows the dry run produced (7 drafts × G1/G2/G3) with the subagent-imported panel and cross-check verdicts. | `node scripts/review/run.mjs --gate all --dry-run --all-gates --panel import --import <dir> --emit-reviews scripts/review/fixtures/reviews.sample.json` |

## Why the record, not the page

The BL2-05 lanes only ever wrote sentences from `signals` / `artifacts` / `companies` / `institutions` /
`faraday_*` (+ JW tables) — never from a re-fetched page — so the fact a sentence must match is the
record text, and the fixture resolver (`createFixtureDb` in `run.mjs`) hands G1 exactly that. Two gaps
found while running the chain are worth knowing: the generator sometimes composes from a signal's
`faradays_take` (the Malaysia sentence in the theaters brief), so `recordFor` includes it; and a
mis-citation in the sample (Germany, the Polar €1B sentence cited to the waste-heat article S3 instead
of the Polar item S2) is a *genuine* G1 FAIL, not a resolver gap — the fixture keeps it on purpose.
**Update (BL3-06, FDY-330, 2026-11-13):** it was neither. The generator cited the Polar sentence to S2;
G1 split the paragraph after "H.I.G." and handed the `[S3]` that closes the previous sentence to the Polar
fragment. G1 now re-attaches a marker that follows a sentence end to that sentence, so the committed
fixtures report 0 `number_mismatch`. The samples (and so these fixtures) predate BL3-06's source hygiene:
they still carry news.google.com refs, "Google News" publishers and housekeeping lines with markers, so
G1's new BL3-06 checks report `source_redirect` ×45, `publisher_google_news` ×9 and `housekeeping_cited` ×31
on them. That is correct for this stale output. Regenerate both (`npm run lanes:samples && npm run
review:fixtures`) where Chromium is available so page counts are measured;
`src/tests/bl3-06-citation-picker.test.ts` runs G1 on freshly composed drafts from the same evidence packs.

## Live mode

With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set the runner ignores this directory and resolves
each `source_refs` url against `artifacts` / `signals` (exact `= any(array[...])` over the url variants —
never a `regexp_replace(...)` predicate across `artifacts`, which cannot use the index and times out)
and `supabase://` record urls against the named table.
