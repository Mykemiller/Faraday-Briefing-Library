-- BL-10 (FDY-176): version snapshots for briefings so every refresh job has a real rollback.
-- NOT APPLIED. Proposed with docs/ops/refresh-jobs.md; applied only on Myke's explicit approval.
-- Additive: one table, one config table, three SECURITY DEFINER functions (service_role only).
-- Rollback: drop function briefings_version_restore, briefings_version_promote,
--           briefings_version_snapshot; drop table briefing_refresh_config, briefings_versions.

create table if not exists public.briefings_versions (
  id             uuid primary key default gen_random_uuid(),
  briefing_id    uuid not null references public.briefings (id) on delete cascade,
  version        int  not null check (version >= 1),
  kind           text not null check (kind in ('snapshot','draft')),
  status         text not null check (status in ('planned','draft','qa','published','retired')),
  title          text not null,
  tier           text,
  page_target    int,
  sector_id      text,
  thread_id      text,
  theme_tags     text[] not null default '{}',
  source_refs    jsonb,
  institution_id text,
  company_id     text,
  briefing_type  text,
  byline         text,
  hypothesis     text,
  contents       text[],
  last_refreshed timestamptz,
  published_at   timestamptz,
  job            text,
  evidence_from  timestamptz,
  evidence_to    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     text not null default 'service_role',
  constraint briefings_versions_draft_is_draft check (kind <> 'draft' or status = 'draft'),
  constraint briefings_versions_uniq unique (briefing_id, version, kind)
);
comment on table public.briefings_versions is
  'BL-10: append-only editorial snapshots of briefings. kind=draft rows are job output (always status=draft); kind=snapshot rows are taken by promote/restore before they touch the live row.';

create table if not exists public.briefing_refresh_config (
  job              text primary key,
  enabled          boolean not null default false,
  min_new_signals  int not null default 3,
  min_gap_days     int not null default 14,
  fact_confidence  text[] not null default array['VRF','SRC'],
  notes            text
);
insert into public.briefing_refresh_config (job, notes) values
  ('briefing-refresh-deep',     'monthly; see docs/ops/refresh-jobs.md §2.1'),
  ('briefing-refresh-standard', 'quarterly; §2.2'),
  ('briefing-refresh-profile',  'on signal, daily sweep; §2.3')
on conflict (job) do nothing;

alter table public.briefings_versions enable row level security;
alter table public.briefing_refresh_config enable row level security;
revoke all on public.briefings_versions from anon, authenticated;
revoke all on public.briefing_refresh_config from anon, authenticated;

-- Snapshot the live row (kind=snapshot, version = current). Idempotent per (briefing, version).
create or replace function public.briefings_version_snapshot(p_briefing uuid, p_job text default 'manual')
returns int language plpgsql security definer set search_path = 'public' as $$
declare v int;
begin
  insert into public.briefings_versions
    (briefing_id, version, kind, status, title, tier, page_target, sector_id, thread_id, theme_tags,
     source_refs, institution_id, company_id, briefing_type, byline, hypothesis, contents,
     last_refreshed, published_at, job)
  select id, version, 'snapshot', status, title, tier, page_target, sector_id, thread_id, theme_tags,
         source_refs, institution_id, company_id, briefing_type, byline, hypothesis, contents,
         last_refreshed, published_at, p_job
  from public.briefings where id = p_briefing
  on conflict (briefing_id, version, kind) do nothing
  returning version into v;
  if v is null then select version into v from public.briefings where id = p_briefing; end if;
  return v;
end $$;

-- Promote a staged draft onto the live row. status is NOT changed here (publishing is a separate,
-- explicit UPDATE by Myke). Snapshots the live row first.
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
    institution_id = d.institution_id, company_id = d.company_id, briefing_type = d.briefing_type,
    byline = d.byline, hypothesis = d.hypothesis, contents = d.contents,
    last_refreshed = now(), version = d.version
  where id = p_briefing;
end $$;

-- Restore a previous version. A restore is a NEW version (history stays append-only) and it
-- snapshots the current row first, so it can itself be undone. status is NOT changed.
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
    institution_id = s.institution_id, company_id = s.company_id, briefing_type = s.briefing_type,
    byline = s.byline, hypothesis = s.hypothesis, contents = s.contents,
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
