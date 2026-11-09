-- BL2-05 (FDY-281, release 46-26-v01): a dedicated column for the briefing manuscript.
--
-- ADDITIVE ONLY — two nullable columns and three CREATE OR REPLACE bodies; nothing is removed or
-- emptied. Per the FDY-281 migration rule an additive-only
-- migration may be applied once the PR is merged (apply_migration, then run the §Verify block).
-- Until it is applied the lane runner detects the missing column and stores the manuscript as
-- contents[0] instead (scripts/lanes/run.mjs, `manuscript_md` column probe).
--
-- What this file does:
--   §1  briefings.manuscript_md text NULL — the Markdown manuscript of record for the live row.
--   §2  briefings_versions.manuscript_md text NULL — the same for every staged draft / snapshot.
--   §3  The three BL-10 functions (snapshot / promote / restore, as re-issued by BL2-01 §7) carry
--       manuscript_md alongside the other editorial columns, so promoting a draft publishes its
--       manuscript and a restore is not lossy. Bodies are otherwise byte-identical to BL2-01's;
--       signatures unchanged, so the existing EXECUTE grants (service_role only) carry over.
--
-- Rollback (reverse order): re-create the three functions from
-- 20261109120000_bl2_01_types_and_review.sql §7, then remove the manuscript_md column from
-- briefings_versions and from briefings (ALTER TABLE … column removal; both are nullable and
-- nothing else references them).
--
-- Verify (after apply):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name in ('briefings','briefings_versions') and column_name='manuscript_md';  -- 2 rows
--   select prosrc like '%manuscript_md%' from pg_proc where proname='briefings_version_promote';         -- t

-- ───────────────────────────── §1 briefings.manuscript_md ─────────────────────────────
alter table public.briefings
  add column if not exists manuscript_md text;

comment on column public.briefings.manuscript_md is
  'BL2-05 (FDY-281): the Markdown manuscript of record (cover, sections, Faraday''s Take, Sources & methodology). '
  'Every factual sentence carries an [Sn] marker that resolves to source_refs[n-1]. Rendered to HTML/PDF by '
  'scripts/templates/manuscript.mjs; never edited in place by jobs — drafts stage in briefings_versions.';

-- ───────────────────────────── §2 briefings_versions.manuscript_md ─────────────────────────────
alter table public.briefings_versions
  add column if not exists manuscript_md text;

comment on column public.briefings_versions.manuscript_md is
  'BL2-05 (FDY-281): the staged or snapshotted manuscript (Markdown) for this version. kind=draft rows are '
  'written by the lane runner (job = lane-<lane>); promote copies it to briefings.manuscript_md.';

-- ───────────────────────────── §3 BL-10 functions carry manuscript_md ─────────────────────────────
create or replace function public.briefings_version_snapshot(p_briefing uuid, p_job text default 'manual')
returns int language plpgsql security definer set search_path = 'public' as $$
declare v int;
begin
  insert into public.briefings_versions
    (briefing_id, version, kind, status, title, tier, page_target, sector_id, thread_id, theme_tags,
     source_refs, institution_id, company_id, jurisdiction_id, briefing_type, byline, hypothesis, contents,
     manuscript_md, last_refreshed, published_at, job)
  select id, version, 'snapshot', status, title, tier, page_target, sector_id, thread_id, theme_tags,
         source_refs, institution_id, company_id, jurisdiction_id, briefing_type, byline, hypothesis, contents,
         manuscript_md, last_refreshed, published_at, p_job
  from public.briefings where id = p_briefing
  on conflict (briefing_id, version, kind) do nothing
  returning version into v;
  if v is null then select version into v from public.briefings where id = p_briefing; end if;
  return v;
end $$;

create or replace function public.briefings_version_promote(p_briefing uuid, p_version int)
returns void language plpgsql security definer set search_path = 'public' as $$
declare d public.briefings_versions%rowtype;
begin
  select * into d from public.briefings_versions
   where briefing_id = p_briefing and version = p_version and kind = 'draft';
  if not found then raise exception 'no staged draft % for briefing %', p_version, p_briefing; end if;
  perform public.briefings_version_snapshot(p_briefing, 'promote');
  update public.briefings set
    title = d.title, tier = d.tier, page_target = d.page_target, sector_id = d.sector_id,
    thread_id = d.thread_id, theme_tags = d.theme_tags, source_refs = d.source_refs,
    institution_id = d.institution_id, company_id = d.company_id, jurisdiction_id = d.jurisdiction_id,
    briefing_type = d.briefing_type, byline = d.byline, hypothesis = d.hypothesis, contents = d.contents,
    manuscript_md = d.manuscript_md,
    last_refreshed = now(), version = d.version
  where id = p_briefing;
end $$;

create or replace function public.briefings_version_restore(p_briefing uuid, p_version int)
returns int language plpgsql security definer set search_path = 'public' as $$
declare s public.briefings_versions%rowtype; cur int;
begin
  select * into s from public.briefings_versions
   where briefing_id = p_briefing and version = p_version and kind = 'snapshot';
  if not found then raise exception 'no snapshot of version % for briefing %', p_version, p_briefing; end if;
  cur := public.briefings_version_snapshot(p_briefing, 'restore');
  update public.briefings set
    title = s.title, tier = s.tier, page_target = s.page_target, sector_id = s.sector_id,
    thread_id = s.thread_id, theme_tags = s.theme_tags, source_refs = s.source_refs,
    institution_id = s.institution_id, company_id = s.company_id, jurisdiction_id = s.jurisdiction_id,
    briefing_type = s.briefing_type, byline = s.byline, hypothesis = s.hypothesis, contents = s.contents,
    manuscript_md = s.manuscript_md,
    last_refreshed = s.last_refreshed, version = cur + 1
  where id = p_briefing;
  return cur + 1;
end $$;

revoke execute on function public.briefings_version_snapshot(uuid, text) from public, anon, authenticated;
revoke execute on function public.briefings_version_promote(uuid, int) from public, anon, authenticated;
revoke execute on function public.briefings_version_restore(uuid, int) from public, anon, authenticated;
grant execute on function public.briefings_version_snapshot(uuid, text) to service_role;
grant execute on function public.briefings_version_promote(uuid, int) to service_role;
grant execute on function public.briefings_version_restore(uuid, int) to service_role;
