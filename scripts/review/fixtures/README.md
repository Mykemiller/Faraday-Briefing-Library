# Review-chain fixtures (BL2-06, FDY-282)

Everything `node scripts/review/run.mjs --dry-run` reads when no Supabase environment is present.

| File | What it is | How it was made |
|---|---|---|
| `drafts.json` | Seven `briefings_versions` drafts, one per lane (theaters · domains · subdomains · companies · institutions · states · countries). `contents[0]` is the manuscript (Markdown), `source_refs` the numbered citation list — the BL2-05 shape. | `node scripts/review/fixtures/build.mjs`. Four are real sourced manuscripts (the BL-08 Deep sample and three BL-09 samples converted); three are what the BL2-04 lane runner stages today (template skeleton, no sources) because BL2-05 has not landed. |
| `briefings.json` | The parent `briefings` rows (ids for the four real records come from production; the three stubs use the BL2-04 lane-fixture ids). | `build.mjs` |
| `briefing_lanes.json` | Seven lane rows, quota 3, empty cursors. | `build.mjs` |
| `briefing_reviews.prior.json` | One prior `G1-AUTO · FAIL` on Texas v1, so the v2 run exercises the two-consecutive-FAILs ⇒ PARKED path. | `build.mjs` |
| `sources.json` | The Faraday records behind every URL the four real drafts cite (86 URLs): artifact ids, the longest captured body text per URL (`coalesce(body_text, raw_content)`, capped at 14,000 chars, `truncated` flagged), signal ids + framings, and the three `public.companies` rows the CoreWeave/Nebius/Schneider profiles cite. | Read-only SELECTs against `ycadmmngkdhvpcsrcuaq` on 2026-11-09 (below). Re-capture when the samples change. |
| `reviews.sample.json` | The review rows the dry run produced for the seven drafts (3 gates each) with the subagent-imported panel/cross-check verdicts. | `node scripts/review/run.mjs --gate all --dry-run --all-gates --panel import --import <dir> --emit-reviews scripts/review/fixtures/reviews.sample.json` |

## Capturing `sources.json`

```sql
-- urls = every distinct url in the drafts' source_refs, plus the two normalised variants the
-- crawlers store: protocol-relative ("//www.rtoinsider.com/…") and blog.se.com with
-- "?utm_source=rss&utm_medium=feed&utm_campaign=rss_campaign".
select a.artifact_id, a.source_url, coalesce(a.signal_envelope->>'title', a.signal_envelope->>'headline') title,
       a.published_at, left(coalesce(a.body_text, a.raw_content), 14000) text, length(coalesce(a.body_text, a.raw_content)) full_len
from public.artifacts a where a.source_url = any(:urls);

select s.id, s.source_url, s.artifact_id, s.fired_at, s.framing
from public.signals s where s.source_url = any(:urls);
```

Per URL (normalised: `//` → `https://`, query string dropped) keep every `artifact_id`, the text of the
longest-bodied artifact as `best_artifact`, and the signals. Non-http record URLs
(`supabase://…/public.companies?company_uid=…`) go under `records` with a one-line text rendering of the
row; `airtable://…` record URLs are resolved against the brief's own `airtable_record_id` at run time.

Do not query with `regexp_replace(source_url, …) = …` across `artifacts` — the table is large and the
expression cannot use the index (a 60 s timeout, found while capturing). Exact `= any(array[...])` with
the known variants is fast.
