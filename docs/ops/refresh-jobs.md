# Briefing refresh jobs by tier (BL-10)

**Linear:** FDY-176 (BL-10), Briefing Library V2 program · **Status: DEFINITIONS ONLY — no schedule is
enabled, nothing here runs.** Schedules start only after this PR is merged and each job's enabling
step (§6) is done by Myke. Written 2026-11-06 CT against the live `ycadmmngkdhvpcsrcuaq` schema.

Depends on: BL-05 merged (PR #20, 2026-11-06) — `public.briefings` is the write path.

## 0. Rules every job obeys

| Rule | How it is enforced, not just stated |
|---|---|
| **Every run writes `status = 'draft'`, never `'published'`.** Publishing needs Myke's approval. | A refresh never changes the live row's `status`. It writes the regenerated content as a **staged version row** (`briefings_versions.kind = 'draft'`, `status = 'draft'`), and that table carries `CHECK (kind <> 'draft' OR status = 'draft')`. The live `briefings` row stays exactly as it was (published stays on the shelf) until Myke promotes the staged version. The anon SELECT policy on `briefings` (`status = 'published'`) is therefore never widened by a job. |
| **Every job has a rollback step: restore the previous version from `briefings.version`.** | `briefings.version` is an integer, so by itself it cannot restore content. The companion migration (`20261106220000_bl10_briefings_versions.sql`, **NOT applied**) adds `briefings_versions` — a snapshot of every editorial column keyed `(briefing_id, version, kind)` — and `briefings_version_restore(briefing_id, version)`, which snapshots the current row first (so a restore is itself reversible) and copies the named version back, bumping `version`. Until that migration is applied the rollback is manual (§5). |
| A job only ever reads `briefings`, `briefings_versions`, `signals`, `company_signal_rollup`, `company_facts`, `artifacts` and the IDF 5.0 taxonomy tables. It never writes `library_catalog_cache` (the sync owns it), `jpas_*`, `jps_*`, `jw_*`, `companies` or any Airtable base. | Service-role writes to `briefings_versions` only; the live row is touched only by the human promotion step (§4). |
| One health row per run in `automation_health_log` (`auto_id` provisional — registry grant pending, do NOT self-assign), success **or** failure, plus one `ingest_staleness_watch` row per job in `error` mode so a run that errors pages the daily `ingest-staleness-healthcheck` (CC-INGEST-STALLED-LANES-1.0 pattern). | A job that produces nothing still writes its health row with `artifacts_found = 0`. |
| Secrets: any pg_cron entry calls `public.cron_http_post(url, body, 'cron_caller_token', …)` with the Vault secret NAME (FAR-344). No token in `cron.job.command`. | Reviewed at PR time. |

**Generation itself is out of scope here.** Each job hands a `briefing_id` + evidence window to the
same generator the tier templates describe (`docs/templates/{deep,standard,profile}.md`); this
document fixes *when* it runs, *what* it reads, *what* it may write, and *how to undo it*.

## 1. Tier → cadence (locked by the FDY-176 prompt)

| Tier (`briefings.tier`) | Cadence | Trigger type |
|---|---|---|
| `deep` | **Monthly** | schedule |
| `standard` | **Quarterly** | schedule |
| `profile` | **On signal** | event-driven sweep: new source material for the briefing's entity |

> **Flag (measured 2026-11-06):** all 436 `briefings` rows have `tier = NULL` and `last_refreshed = NULL`.
> Every job below selects on `tier`, so **today each job's candidate set is empty**. Tiering the
> rows (Deep = Theater briefs; Standard = Sector/Thread; Profile = company placeholders, per Brand
> Bible V2 §05) is editorial work that precedes the first real run.

## 2. Job definitions

### 2.1 `briefing-refresh-deep` — monthly

| | |
|---|---|
| **Schedule (proposed, NOT enabled)** | pg_cron `briefing-refresh-deep` · `0 6 1 * *` (1st of each month, 06:00 UTC = 00:00/01:00 CT). Deep briefs are few (Theater briefs; 3 seeded today), so one run handles the whole tier. |
| **Inputs** | `briefings` where `tier = 'deep'` and `status in ('published','qa','draft')` and `(last_refreshed is null or last_refreshed < now() - interval '1 month')`; for each: its `source_refs`, `signals` rows whose `theme_tags`/`domain_tags`/`subdomain_tags` intersect the brief's `theme_tags`/`sector_id`/`thread_id` with `fired_at > coalesce(last_refreshed, published_at, created_at)`; the Deep template (`docs/templates/deep.md`). `status = 'retired'` and `'planned'` rows are never selected (nothing to refresh). |
| **Output** | One `briefings_versions` row per candidate: `kind='draft'`, `status='draft'`, `version = briefings.version + 1`, the regenerated editorial columns, `job='briefing-refresh-deep'`, `evidence_window = [from, to]`. **The live `briefings` row is not modified.** |
| **Output status** | `draft` — always. |
| **Rollback** | Before promotion: `delete from briefings_versions where briefing_id = $1 and version = $2 and kind = 'draft'`. After promotion: `select briefings_version_restore($1, <previous version>)` (§5). |
| **Failure alert** | `automation_health_log` row with `success=false` + `errors` jsonb; `ingest_staleness_watch` (`briefing-refresh-deep`, mode `error`, 35-day window) pages the daily health check; best-effort Slack via the existing webhook path. A run that errors on one brief continues to the next (per-brief try/catch, the stalled-lanes lesson). |

### 2.2 `briefing-refresh-standard` — quarterly

| | |
|---|---|
| **Schedule (proposed, NOT enabled)** | pg_cron `briefing-refresh-standard` · `0 6 1 1,4,7,10 *` (1 Jan / 1 Apr / 1 Jul / 1 Oct, 06:00 UTC). Standard briefs (Sector/Thread) will number in the dozens; the run is chunked 25 briefs per invocation with a `briefing_refresh_cursor` row so the 150 s gateway limit never truncates it (the FiscalNote `deadline_ms` lesson). |
| **Inputs** | As 2.1 with `tier = 'standard'` and the 1-quarter window; the Standard template (`docs/templates/standard.md`). |
| **Output / status / rollback / alert** | Identical shape to 2.1 (`job='briefing-refresh-standard'`, watch window 100 days). |

### 2.3 `briefing-refresh-profile` — on signal

| | |
|---|---|
| **Trigger (proposed, NOT enabled)** | A **daily sweep**, not a row-level DB trigger: pg_cron `briefing-refresh-profile-sweep` · `30 6 * * *`. A `BEFORE/AFTER INSERT` trigger on `signals` would fire per signal row and fan out to a generator call inside a transaction — the one pattern the estate has learned not to use (jobid 227: never HTTP or throttling inside a pg_cron SQL function). The sweep evaluates the signal condition once a day and enqueues. |
| **"New source_refs rows arrive for an entity" — the concrete test** | For each `briefings` row with `tier = 'profile'`, `status in ('published','qa','draft')` and a `company_id` (or `institution_id`): **new signal** := at least `min_new_signals` (config, default **3**) `signals` rows with `company_tags ? company_id` and `fired_at > coalesce(last_refreshed, published_at, created_at)`, **or** a `company_facts` row for that `company_uid` with `created_at` after the same watermark and `confidence in ('VRF','SRC')`. Both are read-only lookups; `company_signal_rollup.mentions_30d` is the cheap pre-filter (skip the entity when it is 0). A brief refreshed in the last `min_gap_days` (default **14**) is skipped even if signals keep arriving (cooldown, so a news burst produces one draft, not five). |
| **Inputs** | The brief's `source_refs`, the qualifying `signals`/`company_facts` rows, the Profile template (`docs/templates/profile.md`). |
| **Output / status** | As 2.1 (`job='briefing-refresh-profile'`), `status='draft'` always. |
| **Rollback** | As 2.1. |
| **Failure alert** | As 2.1; watch window 3 days on the **sweep** (it must run daily even when it enqueues nothing), so a silent sweep is caught within 72 h. |
| **Config, not code** | `min_new_signals`, `min_gap_days`, and the confidence set live in a `briefing_refresh_config` row (one row per job; proposed in the same unapplied migration). Retune by UPDATE. |

## 3. What a run writes — exactly

```
briefings_versions (NEW, migration NOT applied)
  briefing_id   uuid  → briefings.id
  version       int   -- briefings.version + 1 for a draft; = briefings.version for a snapshot
  kind          text  -- 'snapshot' (taken by restore/promote before they touch the live row) | 'draft' (job output)
  status        text  -- CHECK: kind = 'draft' ⇒ status = 'draft'
  <every editorial column of briefings: title, tier, page_target, sector_id, thread_id, theme_tags,
   source_refs, institution_id, company_id, briefing_type, byline, hypothesis, contents,
   last_refreshed, published_at>
  job, evidence_from, evidence_to, created_at, created_by
  UNIQUE (briefing_id, version, kind)
```

Nothing else. In particular a run never sets `briefings.status`, `published_at`, `last_refreshed`
or `version` — those move only in §4.

## 4. Promotion (human, Myke) — the only path to `published`

1. Review the staged draft (`briefings_versions` row, `kind='draft'`).
2. `select briefings_version_promote(briefing_id, version)` (in the unapplied migration): snapshots the
   current live row (`kind='snapshot'`), copies the draft's editorial columns onto `briefings`, sets
   `version` to the draft's version, `last_refreshed = now()`, and leaves `status` **unchanged** —
   a published brief stays published with new content, a draft brief stays draft.
3. Setting `status = 'published'` on a brief that was not published before is a separate explicit
   UPDATE by Myke, and it is where `briefings_published_requires_source_refs` bites.

## 5. Rollback — the step every job carries

- **Before promotion** (the common case): delete the staged draft row. The live row was never touched.
- **After promotion:** `select briefings_version_restore(briefing_id, previous_version)`. It snapshots
  the current row (so the restore can be undone), copies the named version's editorial columns back,
  and bumps `version` (a restore is a new version, never a rewind — history stays append-only).
- **Until the migration is applied (manual):** before any promotion, `insert into … select` the live
  row into a dated backup table (`cc_bl10_briefing_pre_<date>`), promote, and restore from it by id.

## 6. Enabling (NOT done here; each is Myke's call, in order)

1. Merge this PR. 2. Apply `20261106220000_bl10_briefings_versions.sql` via `apply_migration`.
3. Tier the `briefings` rows (§1 flag). 4. Build the generator hand-off (separate ticket; the tier
templates are the spec). 5. Register the three jobs in the Automation Registry (grants three AUTO ids).
6. Schedule with `cron_http_post` + Vault `cron_caller_token` — Deep first, observe one cycle, then
Standard, then the Profile sweep.
