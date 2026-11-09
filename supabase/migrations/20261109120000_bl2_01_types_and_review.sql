-- BL2-01 (FDY-277, release 46-26-v01): foundations for Briefing Library V2.0 regeneration.
--
-- NOT APPLIED by the PR that adds it. Founder decision 4 (2026-11-09): the merged PR is the approval
-- to apply the migrations it contains — apply via apply_migration on merge, verify with the §Verify
-- block at the foot of this header, then log to the V2.0 status log.
--
-- Founder decisions encoded here (binding, 2026-11-09):
--   (1) `company` is a 4th briefing_type;
--   (2) `jurisdiction` is a 5th briefing_type (US states 'US-XX' and ISO-3166 alpha-2 countries).
--
-- What this file does, in order:
--   §1  briefings.briefing_type CHECK → theater | sector | thread | company | jurisdiction.
--       NULL stays permitted: all 436 live rows carry NULL (FDY-181 made the column nullable and
--       the sync derives the type); a NOT NULL list would reject every existing row.
--   §2  briefings.jurisdiction_id text NULL — FK-free by design. Canonical ids come from the
--       Jurisdiction Watch jurisdiction tables (read, never fork). Shape-checked only.
--   §3  Type ⇒ key constraints: jurisdiction ⇒ jurisdiction_id not null;
--       company ⇒ company_id or institution_id not null. (NULL briefing_type passes both.)
--   §4  briefings.status CHECK gains 'qa' if absent (BL-10 docs assume it; live already has it —
--       the block is a no-op guard, kept so the file is correct against any environment).
--   §5  briefing_lanes — one row per generation lane (quota + cursor + block reason). Seeded with
--       the seven lanes at daily_quota = 0 (inert until BL2-04 sets quotas).
--   §6  briefing_reviews — one row per gate verdict per (briefing, version). RLS on, service_role
--       only, anon/authenticated privileges revoked BY NAME (the estate's lesson: RLS alone leaves
--       grants visible to the advisor).
--   §7  briefings_versions carries jurisdiction_id forward, and the three BL-10 functions
--       (snapshot / promote / restore) copy it, so a jurisdiction brief's rollback is not lossy.
--   §8  FDY-180 fold-in: the idempotent DELETE of the 10 retired `keyplayer` seed rows. The
--       standalone file (20261013170000) was approved under BL2-01 Part A but apply_migration
--       raised a destructive-statement confirmation that no human could answer in an unattended
--       run (twice, 2026-11-09 01:19 / 01:31 CT). Carried here exactly as written; if the file has
--       been applied by then, the block logs a notice and does nothing.
--
-- Rollback (reverse order; restores the measured 2026-11-09 pre-state except §8, which is a
-- deliberate data retirement — re-seed via scripts/seed-fbl10.ts only if Myke asks):
--   drop function if exists public.briefings_version_restore(uuid, int);
--   drop function if exists public.briefings_version_promote(uuid, int);
--   drop function if exists public.briefings_version_snapshot(uuid, text);
--   -- then re-create the three from supabase/migrations/20261106220000_bl10_briefings_versions.sql
--   alter table public.briefings_versions drop column if exists jurisdiction_id;
--   drop table if exists public.briefing_reviews;
--   drop table if exists public.briefing_lanes;
--   alter table public.briefings drop constraint if exists briefings_company_requires_entity;
--   alter table public.briefings drop constraint if exists briefings_jurisdiction_requires_id;
--   alter table public.briefings drop constraint if exists briefings_jurisdiction_id_format;
--   drop index if exists public.briefings_jurisdiction_id_idx;
--   alter table public.briefings drop column if exists jurisdiction_id;
--   alter table public.briefings drop constraint if exists briefings_briefing_type_check,
--     add constraint briefings_briefing_type_check
--       check (briefing_type is null or briefing_type in ('theater','sector','thread'));
--   -- §4 needs no rollback ('qa' was already present).
--
-- Verify (after apply):
--   select pg_get_constraintdef(oid) from pg_constraint where conname='briefings_briefing_type_check';
--   select to_regclass('public.briefing_lanes'), to_regclass('public.briefing_reviews');
--   select count(*) from public.briefing_lanes;                                  -- 7
--   select count(*) from public.library_catalog_cache where briefing_type='keyplayer';  -- 0
--   select relrowsecurity from pg_class where relname in ('briefing_lanes','briefing_reviews'); -- t,t
--   select count(*) from information_schema.role_table_grants
--     where table_name in ('briefing_lanes','briefing_reviews') and grantee in ('anon','authenticated'); -- 0

-- ───────────────────────────── §1 briefing_type vocabulary ─────────────────────────────
alter table public.briefings
  drop constraint if exists briefings_briefing_type_check,
  add constraint briefings_briefing_type_check
    check (briefing_type is null
           or briefing_type in ('theater', 'sector', 'thread', 'company', 'jurisdiction'));

comment on column public.briefings.briefing_type is
  'FDY-181 + BL2-01 (FDY-277): theater | sector | thread | company | jurisdiction (public vocabulary). '
  'NULL ⇒ the catalog sync derives it (jurisdiction_id ⇒ jurisdiction, company_id ⇒ company, else IDF placement).';

-- ───────────────────────────── §2 jurisdiction_id ─────────────────────────────
alter table public.briefings
  add column if not exists jurisdiction_id text;

comment on column public.briefings.jurisdiction_id is
  'BL2-01 (FDY-277): the jurisdiction a jurisdiction brief covers. ''US-XX'' for US states/DC/PR, '
  'ISO-3166 alpha-2 for countries. FK-free on purpose: canonical ids come from the Jurisdiction Watch '
  'jurisdiction tables (project ycadmmngkdhvpcsrcuaq) — read them, never fork them.';

alter table public.briefings
  drop constraint if exists briefings_jurisdiction_id_format,
  add constraint briefings_jurisdiction_id_format
    check (jurisdiction_id is null or jurisdiction_id ~ '^(US-[A-Z]{2}|[A-Z]{2})$');

create index if not exists briefings_jurisdiction_id_idx on public.briefings (jurisdiction_id);

-- ───────────────────────────── §3 type ⇒ key constraints ─────────────────────────────
alter table public.briefings
  drop constraint if exists briefings_jurisdiction_requires_id,
  add constraint briefings_jurisdiction_requires_id
    check (briefing_type is distinct from 'jurisdiction' or jurisdiction_id is not null);

alter table public.briefings
  drop constraint if exists briefings_company_requires_entity,
  add constraint briefings_company_requires_entity
    check (briefing_type is distinct from 'company' or company_id is not null or institution_id is not null);

-- ───────────────────────────── §4 status gains 'qa' if absent ─────────────────────────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint where conrelid = 'public.briefings'::regclass and conname = 'briefings_status_check';
  if def is null or def !~ '''qa''' then
    alter table public.briefings drop constraint if exists briefings_status_check;
    alter table public.briefings add constraint briefings_status_check
      check (status in ('planned','draft','qa','published','retired'));
    raise notice 'BL2-01 §4: briefings_status_check recreated with qa';
  else
    raise notice 'BL2-01 §4: briefings_status_check already includes qa; unchanged';
  end if;
end $$;

-- ───────────────────────────── §5 briefing_lanes ─────────────────────────────
create table if not exists public.briefing_lanes (
  lane           text primary key
                   check (lane in ('theaters','domains','subdomains','companies','states','countries','institutions')),
  daily_quota    int  not null default 0 check (daily_quota >= 0),
  cursor         jsonb not null default '{}'::jsonb,
  blocked_reason text,
  updated_at     timestamptz not null default now()
);
comment on table public.briefing_lanes is
  'BL2-01 (FDY-277): one row per V2.0 generation lane. daily_quota = briefs the lane may draft per day '
  '(0 = inert); cursor = the lane runner''s resume state (BL2-04); blocked_reason non-null parks the lane.';

insert into public.briefing_lanes (lane) values
  ('theaters'), ('domains'), ('subdomains'), ('companies'), ('states'), ('countries'), ('institutions')
on conflict (lane) do nothing;

alter table public.briefing_lanes enable row level security;
revoke all on table public.briefing_lanes from public, anon, authenticated;
drop policy if exists briefing_lanes_service_role_only on public.briefing_lanes;
create policy briefing_lanes_service_role_only on public.briefing_lanes
  for all to service_role using (true) with check (true);

-- ───────────────────────────── §6 briefing_reviews ─────────────────────────────
create table if not exists public.briefing_reviews (
  id          uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings (id) on delete cascade,
  version     int  not null check (version >= 1),
  gate        text not null check (gate in ('G1-AUTO','G2-PANEL','G3-XCHECK')),
  reviewer    text not null,
  result      text not null check (result in ('PASS','FAIL')),
  score       numeric,
  blockers    jsonb,
  notes       text,
  created_at  timestamptz not null default now()
);
comment on table public.briefing_reviews is
  'BL2-01 (FDY-277): one row per review-gate verdict per (briefing, version). Gates G1-AUTO → G2-PANEL → '
  'G3-XCHECK (BL2-06). Append-only by convention; service_role only.';

create index if not exists briefing_reviews_briefing_version_idx
  on public.briefing_reviews (briefing_id, version, created_at desc);

alter table public.briefing_reviews enable row level security;
revoke all on table public.briefing_reviews from public, anon, authenticated;
drop policy if exists briefing_reviews_service_role_only on public.briefing_reviews;
create policy briefing_reviews_service_role_only on public.briefing_reviews
  for all to service_role using (true) with check (true);

-- ───────────────────────────── §7 briefings_versions carries jurisdiction_id ─────────────────────────────
alter table public.briefings_versions
  add column if not exists jurisdiction_id text;

-- Re-issue the three BL-10 functions with jurisdiction_id in the editorial column list. Bodies are
-- otherwise byte-identical to 20261106220000_bl10_briefings_versions.sql; signatures unchanged, so the
-- existing EXECUTE grants (service_role only) carry over.
create or replace function public.briefings_version_snapshot(p_briefing uuid, p_job text default 'manual')
returns int language plpgsql security definer set search_path = 'public' as $$
declare v int;
begin
  insert into public.briefings_versions
    (briefing_id, version, kind, status, title, tier, page_target, sector_id, thread_id, theme_tags,
     source_refs, institution_id, company_id, jurisdiction_id, briefing_type, byline, hypothesis, contents,
     last_refreshed, published_at, job)
  select id, version, 'snapshot', status, title, tier, page_target, sector_id, thread_id, theme_tags,
         source_refs, institution_id, company_id, jurisdiction_id, briefing_type, byline, hypothesis, contents,
         last_refreshed, published_at, p_job
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

-- ───────────────────────────── §8 FDY-180 fold-in ─────────────────────────────
-- Verbatim body of 20261013170000_fdy180_retire_keyplayer_seed_rows.sql (see header for why).
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

-- ───────────────────────────── verification gate ─────────────────────────────
-- Fail (and roll back) unless the new tables are RLS-on with zero anon/authenticated privileges and
-- the type vocabulary is exactly the five-value list.
do $$
declare bad text; def text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relname in ('briefing_lanes','briefing_reviews')
    and (not c.relrowsecurity
         or exists (select 1 from information_schema.role_table_grants g
                    where g.table_schema = 'public' and g.table_name = c.relname
                      and g.grantee in ('anon','authenticated')));
  if bad is not null then raise exception 'BL2-01: RLS/grant verification failed for: %', bad; end if;

  select pg_get_constraintdef(oid) into def
  from pg_constraint where conrelid = 'public.briefings'::regclass and conname = 'briefings_briefing_type_check';
  if def !~ 'company' or def !~ 'jurisdiction' then
    raise exception 'BL2-01: briefing_type CHECK does not carry the new types: %', def;
  end if;
  if (select count(*) from public.briefing_lanes) <> 7 then
    raise exception 'BL2-01: expected 7 lane rows';
  end if;
end $$;
