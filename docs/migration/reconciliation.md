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


---

# Production load — 2026-11-06 (Myke-approved; BL-05 prerequisite closed)

**Applied to `ycadmmngkdhvpcsrcuaq` 2026-11-06 ~2:29 PM CT** as migrations
`20261106200938 fdy181_briefings_editorial_columns` (the PR #19 file, verbatim) and
`20261106202905 bl04_briefings_production_load` (this file, verbatim:
`production-load-2026-11-06.sql`). Approval: Myke, cross-session card 2026-11-06 — *"apply the
FDY-181 columns migration, then run the BL-04 production load (436 rows)."*

**Why a transcribed INSERT and not `--target supabase:`:** the session container's egress to
`*.supabase.co` is proxy-blocked, so the loader's production path could not run. The loader ran
against a local PGlite target exactly as in the section above, and its 436 output rows were dumped
as one idempotent `INSERT … ON CONFLICT (airtable_record_id) DO NOTHING`. A re-apply against the
local copy inserted 0 rows (idempotency proven before the production apply).

## Registry refresh — 21 company links could not be kept

The 2026-10-13 registry snapshot named 352 `company_uid`s. Re-verified read-only against live
`public.companies` on 2026-11-06: **331 are byte-identical (record id → uid), 0 changed, 21 no
longer exist** (deleted between 2026-10-13 and 2026-11-06 — they are still present in the
`cc_companies_pre_20260903` snapshot; no supersede/alias map records where they went, and none
re-resolves by Airtable record id or by name). Loading them would have violated
`briefings_company_id_fkey`. Per the loader's own rule (links resolve by key only, nothing is
guessed) they were dropped from the registry map (`registry-snapshot-2026-11-06.json`), so the
affected briefings carry `company_id = NULL` and are listed in `unmatched-links-2026-11-06.csv`
as `no_registry_row`. **Re-link these 21 once the company registry settles:**

| Airtable record | company_uid (gone) | Tracking Company |
|---|---|---|
| `recgt4Bj75a13NUBk` | `cmp_a7c245701cf56e5f` | Aligned Energy |
| `recfRacvV1NmrECaU` | `cmp_20c5846ad6cfc004` | Ascendas REIT |
| `recbkwyX8Au6YlW0Q` | `cmp_4cbe0d6ff05b4953` | Bechtel Nuclear |
| `rec6t3L7uxFOzqlxU` | `cmp_f1ff8f11150d5c91` | Bridge Data Centres (BDC) |
| `rec7RNde2zzWzDDtD` | `cmp_4bd46396dbf57ef6` | Castrol (BP) |
| `recBNgk01ZPMFqX5p` | `cmp_e3fb1934c0ad227e` | CoreSite Realty Corporation |
| `recc0SwcEp0Pd4hhe` | `cmp_9d509ccea75dcd4c` | Crusoe Energy |
| `recWdcFtPPNBNNoc0` | `cmp_734b1b96332dc54f` | DDN (DataDirect Networks) |
| `reck1u7IQVTiFWpRF` | `cmp_bd1b1276a1f8edc9` | EdgeCore Internet Real Estate |
| `rechq9N4aVM75kLlA` | `cmp_3b866661f7d8e937` | Efficient Power Conversion (EPC) |
| `recRuFSCrcIX1bAG9` | `cmp_d6a28366e3eb9c36` | G42 Cloud |
| `recU3hbeyHkbZG0Jg` | `cmp_fbc90e6e36ea1f9c` | HUMAIN (Saudi Arabia) |
| `recIZJaK85xmHYAFp` | `cmp_2a3074b199bef915` | iMasons |
| `recQ5ZDHFCGGToA2L` | `cmp_afecc3e0a1f9c871` | Lambda Labs |
| `recjLp4Lllafo1rKJ` | `cmp_b48f384afbaa4a20` | MGX (Abu Dhabi) |
| `recAMNlmP41uDedPj` | `cmp_fc43f3890919268f` | Modine Manufacturing (Airedale) |
| `recSIagy7EXbL3NZ3` | `cmp_d493ebe4185a802a` | Motivair (by Schneider Electric) |
| `recdEeYexBzimGu3o` | `cmp_37c9ec85c7852869` | NTT / RagingWire Data Centers |
| `recJvROimbzH26J0R` | `cmp_f9613ad86c3c44d9` | QTS Realty |
| `reca4SYanvfUFWn8W` | `cmp_43544fb48f2375f0` | Schneider Electric IT (UK/EMEA) |
| `recKScAzzfuYKnHUT` | `cmp_49002dee5524bf85` | Talen Energy / Susquehanna Nuclear |

## Result: 436 of 436, verified live

| `briefings.status` | Expected (2026-10-13 run) | Live after load | Δ |
|---|---:|---:|---:|
| `published` | 0 | 0 | 0 |
| `draft` | 79 | 79 | 0 |
| `planned` | 357 | 357 | 0 |
| `retired` | 0 | 0 | 0 |
| **Total** | **436** | **436** | **0** |

Links written: `company_id` **337** (was 358 in the local run — the 21 above), `thread_id` 58,
`sector_id` 6, `theme_tags` non-empty 11; 436 distinct `airtable_record_id`; 0 dangling company FKs.
Row-set fingerprint (md5 over per-row md5s, collation-independent): local loader output
`e45e30fd62b6372c9a033234b236edd1` == production `e45e30fd62b6372c9a033234b236edd1`.

Airtable still reported `totalRecordCount` = 436 on 2026-11-06; the source snapshot is the
2026-10-13 read (content changes since then, if any, are not reflected — re-snapshot and re-run the
loader if Airtable was edited after 2026-10-13; the upsert only rewrites changed values).

Rollback: `delete from public.briefings where airtable_record_id in (…the 436 ids in
production-load-2026-11-06.sql…)` — the table held 0 rows before the load.
