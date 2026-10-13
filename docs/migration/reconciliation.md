# BL-04 reconciliation: Airtable Briefing Library → `public.briefings`

**Where this ran: LOCALLY, not on a Supabase dev branch.** `create_branch` on project
`ycadmmngkdhvpcsrcuaq` timed out a fifth time on 2026-10-13 ("timed out after 60s"), and
`list_branches` afterwards returned `[]`. Per Myke's 2026-10-13 ruling for BL-02/BL-03 ("local
tests OK"), the loader ran against a local Postgres (PGlite 0.5.9, in-process Postgres), with:

- the BL-03 migration `20261013120000_bl03_briefings_canonical.sql` applied verbatim
  (all four foreign keys, the `published` source-refs CHECK, RLS, the `updated_at` trigger);
- key-only stub parent tables `faraday_domains`, `faraday_subdomains`, `companies`, `institutions`
  holding **only the real production keys this load references** (read from production with
  SELECT only): 3 domain codes, 58 sub-domain codes, 352 company UIDs, 0 institution UIDs.

**Nothing was written to production. Airtable was only read. No Storage upload was made.**

## Command

```
node --experimental-strip-types scripts/migrate-briefings.ts \
  --source docs/migration/airtable-snapshot-2026-10-13.json \
  --target pglite:<local data dir> --prepare-local
```

The source snapshot is the full 436-record read of `tbl4kbby85nx6Z891` taken with the Airtable
MCP on 2026-10-13 (`totalRecordCount` = 436). Linked-record resolution uses
`registry-snapshot-2026-10-13.json` (Airtable registry names / Domain IDs, plus production keys
from `companies.airtable_record_id`, `faraday_domains`, `faraday_subdomains`, `faraday_themes`).

## Result: 436 of 436 accounted for

| Airtable status | Source rows | → `briefings.status` | Target rows | Δ |
|---|---:|---|---:|---:|
| Live | 0 | `published` | 0 | 0 |
| Draft | 79 | `draft` | 79 | 0 |
| Coming Soon | 357 | `planned` | 357 | 0 |
| Retired | 0 | `retired` | 0 | 0 |
| **Total** | **436** | | **436** | **0** |

Row-level check (by `airtable_record_id`): 436 source ids found in the target, 436 with the
expected status, 0 missing, 0 wrong status, 0 extra target rows.

## Idempotency

| Run | Inserted | Updated | Unchanged | Target rows |
|---|---:|---:|---:|---:|
| 1 (empty table) | 436 | 0 | 0 | 436 |
| 2 (same input, same database) | 0 | 0 | 436 | 436 |

The upsert keys on `airtable_record_id` and only rewrites a row when a mapped value changed, so the
second run touched nothing (and did not bump `updated_at`).

## Links written

| Column | Rows set | Notes |
|---|---:|---|
| `company_id` | 358 | 7 Draft, 351 Coming Soon. 352 distinct companies. |
| `thread_id` | 58 | all Drafts |
| `sector_id` | 6 | |
| `theme_tags` non-empty | 11 | |
| `institution_id` | 0 | no Airtable field links an institution |

Every FK held against the real keys. `unmatched-links.csv` lists 36 links:

| Reason | Count | Meaning |
|---|---:|---|
| `no_registry_row` (Tracking Companies) | 6 | No `companies` row carries the Airtable record id: Engineered Fluids, NTT/RagingWire Data Centers, Green Revolution Cooling (GRC), Submer, DG Matrix, Solvay. |
| `no_exact_name_match` (IDF Theme) | 3 | "The Rack Revolution" has no `faraday_themes` row. |
| `no_exact_name_match` (IDF Subdomain) | 1 | "Jurisdiction Posture Intelligence (JPS)" — Jurisdiction Watch scope, no sub-domain. |
| `multiple_links_single_column` (IDF Domain) | 24 | 12 records link 2 domains; each resolves, but `sector_id` holds one. Left NULL. |
| `multiple_links_single_column` (Tracking Companies) | 2 | "Williams vs. Enbridge" links 2 companies; `company_id` holds one. Left NULL. |

10 links are genuinely unmatched; 26 resolve to real keys but have no single-valued column to go into
(schema gap G8 in `airtable-field-map.md`).

## Status constraint

BL-03 rejects `status='published'` without non-empty `source_refs`. Airtable has no source field,
so `source_refs` is NULL on every row. With 0 Live records nothing maps to `published`, and the
loader's pre-write check reported **0 violations**. A future Live record would stop the load until
it carries sources.

## Attachments

**Not uploaded: no dev branch / production writes forbidden.** It is also moot: the Attachments
field is empty on all 436 records, so `attachments-inventory.csv` has a header and no rows. The
upload path exists in the loader behind `--upload-attachments` (private bucket
`briefing-attachments`, supabase: target only, refuses production); it was not run.
