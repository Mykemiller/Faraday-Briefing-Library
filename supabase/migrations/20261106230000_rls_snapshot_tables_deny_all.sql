-- RLS on the seven live-only snapshot/backup tables that anon could reach (FDY-178 gate (a);
-- same class as FDY-164 / BL-02). Requested by Myke 2026-11-06 ("write the RLS migration for the
-- 7 snapshot tables, not applied").
--
-- NOT APPLIED. Applied only on Myke's explicit approval via apply_migration.
--
-- Measured 2026-11-06 4:22 PM CT on ycadmmngkdhvpcsrcuaq (read-only): every table below is owned
-- by postgres, has RLS off, 0 policies, and anon + authenticated hold ALL privileges
-- (DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE). No function, pg_cron job or view
-- references any of them, so enabling RLS cuts nothing off. All seven were created live (no repo
-- migration of their own) as snapshots taken before a CC run: _snap_workbench (2026-11-05),
-- artifacts_snap_gnews_{pilot 10-31, full 11-01} and artifacts_snap_source_fill (FDY-90 gnews
-- resolve pilots), cc_th7_*_pre_20261101 (TH-7 OCP Summit registration), predicts_config_bak
-- (2026-10-30). spatial_ref_sys is NOT in this file: it is supabase_admin-owned and the migration
-- role cannot alter it (docs/security/rls-blocked.md).
--
-- Posture: deny-all. RLS on, NO policies, anon/authenticated privileges revoked by name (the
-- estate's lesson: a named-role revoke is required; RLS alone still leaves the grants visible to
-- the advisor). service_role keeps its grants and bypasses RLS, so the backups stay reachable to
-- the humans/tools that restore from them. Expect exactly 7 new INFO rls_enabled_no_policy
-- advisor rows and 7 fewer ERROR rls_disabled_in_public rows.
--
-- Rollback (restores the measured pre-state exactly):
--   alter table public.<t> disable row level security;
--   grant all on table public.<t> to anon, authenticated;
-- for each of the seven tables.

do $$
declare
  t text;
  tables constant text[] := array[
    '_snap_workbench_20261105',
    'artifacts_snap_gnews_full_20261101',
    'artifacts_snap_gnews_pilot_20261031',
    'artifacts_snap_source_fill_20261101',
    'cc_th7_academy_media_rights_pre_20261101',
    'cc_th7_source_registry_pre_20261101',
    'predicts_config_bak_20261030'
  ];
begin
  foreach t in array tables loop
    -- A snapshot that was already dropped is not an error: skip it and say so.
    if to_regclass('public.' || t) is null then
      raise notice 'skip: public.% does not exist', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format(
      'comment on table public.%I is %L', t,
      coalesce(obj_description(('public.' || t)::regclass, 'pg_class') || ' ', '')
        || 'RLS deny-all since migration 20261106230000 (snapshot/backup table; service_role only).'
    );
  end loop;
end $$;

-- Verification gate: fail the migration (and roll it back) unless every surviving table is now
-- RLS-on with no anon/authenticated privilege left.
do $$
declare
  bad text;
begin
  select string_agg(c.relname, ', ')
    into bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relname = any (array[
    '_snap_workbench_20261105',
    'artifacts_snap_gnews_full_20261101',
    'artifacts_snap_gnews_pilot_20261031',
    'artifacts_snap_source_fill_20261101',
    'cc_th7_academy_media_rights_pre_20261101',
    'cc_th7_source_registry_pre_20261101',
    'predicts_config_bak_20261030'
  ])
  and (
    not c.relrowsecurity
    or exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name = c.relname
        and g.grantee in ('anon', 'authenticated')
    )
  );
  if bad is not null then
    raise exception 'RLS/grant verification failed for: %', bad;
  end if;
end $$;
