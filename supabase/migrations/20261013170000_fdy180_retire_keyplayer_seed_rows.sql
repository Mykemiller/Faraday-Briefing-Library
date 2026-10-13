-- FDY-180 — retire the 10 orphaned `keyplayer` seed rows from library_catalog_cache.
--
-- Why: FDY-157 (PR #14) retired the Key Player briefing type. These 10 rows were inserted by
-- scripts/seed-fbl10.ts and survive the catalog sync because `seed-` rows are skipped by the prune
-- and also protected by the BEFORE DELETE trigger library_catalog_cache_seed_guard
-- (20260703181005_fbl10_seed_guard.sql), which silently vetoes any delete of a `seed-` row.
--
-- Approach (Myke, 2026-10-13): the guard is turned off only for this delete and back on in the
-- same transaction, so the other 21 seed rows keep their protection. The trigger is not dropped.
--
-- Guarded: deletes exactly these 10 ids, aborts unless exactly 10 go. Safe to re-run: if none of
-- the ids remain it logs a notice and does nothing. Verified read-only on 2026-10-13: no cart lines,
-- entitlements or foreign keys reference these ids.

do $$
declare
  ids constant text[] := array[
    'seed-b-cs-3',          -- Vantage Data Centers
    'seed-b-cs-4',          -- GE Vernova
    'seed-b-kp-coreweave',
    'seed-b-kp-digital',
    'seed-b-kp-eaton',
    'seed-b-kp-equinix',
    'seed-b-kp-microsoft',
    'seed-b-kp-nvidia',
    'seed-b-kp-schneider',
    'seed-b-kp-vertiv'
  ];
  present int;
  deleted int;
begin
  select count(*) into present
  from public.library_catalog_cache
  where id = any(ids) and briefing_type = 'keyplayer';

  if present = 0 then
    raise notice 'FDY-180: no keyplayer seed rows remain; nothing to do';
    return;
  end if;
  if present <> 10 then
    raise exception 'FDY-180: expected 10 keyplayer seed rows, found %; aborting', present;
  end if;

  alter table public.library_catalog_cache disable trigger library_catalog_cache_seed_guard;

  delete from public.library_catalog_cache
  where id = any(ids) and briefing_type = 'keyplayer';
  get diagnostics deleted = row_count;

  alter table public.library_catalog_cache enable trigger library_catalog_cache_seed_guard;

  if deleted <> 10 then
    raise exception 'FDY-180: deleted % rows, expected 10; rolling back', deleted;
  end if;

  raise notice 'FDY-180: deleted % keyplayer seed rows; seed guard re-enabled', deleted;
end $$;
