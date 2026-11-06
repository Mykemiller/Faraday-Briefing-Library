# RLS on the seven anon-reachable snapshot tables (FDY-178 gate (a))

**Measured:** 2026-11-06, 4:22 PM CT, read-only, production `ycadmmngkdhvpcsrcuaq`.
**Migration:** `supabase/migrations/20261106230000_rls_snapshot_tables_deny_all.sql` — **NOT applied**.
**Requested by:** Myke, 2026-11-06 ("Write the RLS migration for the 7 snapshot tables, not applied").

## Why these seven

The FDY-178 storefront prompt's gate (a) requires no anon-exposed RLS-disabled table in `public`.
The 2026-10-13 BL-01 snapshot found one (`spatial_ref_sys`, blocked — see `rls-blocked.md`). Between
2026-10-28 and 2026-11-05 seven more appeared: backup/snapshot tables created live before CC runs,
each with Supabase's default grant of ALL privileges to `anon` and `authenticated` and RLS off.

| Table | Owner | RLS | Policies | anon / authenticated | Est. rows | Size | Dependents (fn / cron / view) |
|---|---|---|---|---|---:|---:|---|
| `_snap_workbench_20261105` | postgres | off | 0 | ALL | — | 40 kB | none |
| `artifacts_snap_gnews_full_20261101` | postgres | off | 0 | ALL | 541 | 1,072 kB | none |
| `artifacts_snap_gnews_pilot_20261031` | postgres | off | 0 | ALL | 261 | 264 kB | none |
| `artifacts_snap_source_fill_20261101` | postgres | off | 0 | ALL | 78 | 72 kB | none |
| `cc_th7_academy_media_rights_pre_20261101` | postgres | off | 0 | ALL | 4 | 32 kB | none |
| `cc_th7_source_registry_pre_20261101` | postgres | off | 0 | ALL | 2 | 16 kB | none |
| `predicts_config_bak_20261030` | postgres | off | 0 | ALL | — | 16 kB | none |

"—" = never analysed (`reltuples = -1`). Dependents were checked in `pg_proc.prosrc`, `cron.job.command`
and `pg_depend`/`pg_rewrite`: nothing reads these tables, so deny-all cuts nothing off.

## What the migration does

For each table that still exists: `enable row level security`, `revoke all … from anon, authenticated`
(by name — RLS alone leaves the grants in place and the advisor keeps flagging them), and a table comment
recording the change. No policies are created (deny-all); `service_role` keeps its grants and bypasses
RLS, so restores still work. A final DO block raises, rolling the migration back, unless every surviving
table is RLS-on with no `anon`/`authenticated` privilege left. A table that has already been dropped is
skipped with a notice, not an error.

## Expected advisor delta after apply

`rls_disabled_in_public`: −7 ERROR rows. `rls_enabled_no_policy`: +7 INFO rows (the intended deny-all
posture, same as every other CC audit table). `spatial_ref_sys` remains the one documented exception.

## Rollback

```sql
alter table public.<t> disable row level security;
grant all on table public.<t> to anon, authenticated;
```
for each of the seven tables — this restores the measured pre-state exactly.
