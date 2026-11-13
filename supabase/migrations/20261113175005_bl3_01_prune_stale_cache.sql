-- BL3-01 (FDY-328) — prune stale library_catalog_cache rows.
-- CONTAINS DELETE: PR it, do NOT apply unattended. Post "READY TO APPLY" (Tier 3 / Myke).
-- Deletes cache rows whose briefing is retired (no matching non-retired briefings row). Spares 'seed-' fixtures.
-- Measured 2026-11-13 11:50 CT (read-only dry run): 378 rows total, 213 stale, 0 orphans without a briefing,
-- 0 cart lines and 0 entitlements reference a stale id, no foreign keys point at the table.
-- The shelf no longer reads this table for membership (BL3-01), so this is cleanup, not a fix.
-- Rollback: rows are re-creatable only for non-retired briefings (sync); retired rows are intentionally gone.
--   Before applying, optionally: create table _bl3_01_cache_backup as select * from library_catalog_cache;
-- Idempotent: a second run deletes 0 rows.
do $$
declare n_before int; n_stale int; n_deleted int; n_leftover int;
begin
  select count(*) into n_before from library_catalog_cache;
  select count(*) into n_stale from library_catalog_cache c
   where c.id not like 'seed-%'
     and not exists (select 1 from briefings b
                      where coalesce(b.airtable_record_id, b.id::text) = c.id and b.status <> 'retired');
  -- Safety gate: refuse if any cart line or entitlement would be orphaned.
  if exists (select 1 from library_cart_items i join library_catalog_cache c on c.id = i.briefing_id
              where c.id not like 'seed-%' and not exists (select 1 from briefings b
                where coalesce(b.airtable_record_id, b.id::text) = c.id and b.status <> 'retired'))
     or exists (select 1 from library_entitlements e join library_catalog_cache c on c.id = e.briefing_id
              where c.id not like 'seed-%' and not exists (select 1 from briefings b
                where coalesce(b.airtable_record_id, b.id::text) = c.id and b.status <> 'retired'))
  then raise exception 'BL3-01 prune aborted: cart or entitlement rows reference stale cache ids'; end if;

  delete from library_catalog_cache c
   where c.id not like 'seed-%'
     and not exists (select 1 from briefings b
                      where coalesce(b.airtable_record_id, b.id::text) = c.id and b.status <> 'retired');
  get diagnostics n_deleted = row_count;

  select count(*) into n_leftover from library_catalog_cache c
   where c.id not like 'seed-%'
     and not exists (select 1 from briefings b
                      where coalesce(b.airtable_record_id, b.id::text) = c.id and b.status <> 'retired');
  if n_leftover <> 0 or n_deleted <> n_stale then
    raise exception 'BL3-01 prune verify failed: stale=% deleted=% leftover=%', n_stale, n_deleted, n_leftover;
  end if;
  raise notice 'BL3-01 prune ok: before=% deleted=% after=%', n_before, n_deleted, n_before - n_deleted;
end $$;
