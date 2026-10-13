-- BL-03 (FDY-169): canonical `briefings` table.
--
-- Decision (Myke, Q9 = C+B): the Airtable Briefing Library moves into this table.
-- No second copy of any registry is created here; every taxonomy / entity reference
-- points at the existing IDF 5.0 tables by their REAL keys (read from production
-- 2026-10-13, read-only):
--   faraday_domains.domain_code        text PK  -> briefings.sector_id
--   faraday_subdomains.subdomain_code  text PK  -> briefings.thread_id   (D#.#)
--   institutions.institution_uid       text PK  -> briefings.institution_id
--   companies.company_uid              text PK  -> briefings.company_id
-- All four keys are `text`, so the referencing columns are `text` (not uuid).
-- sector_id / thread_id stay nullable until the IDF 5.0 mapping is confirmed.
--
-- Entity-to-Sub-Domain links stay in `subdomain_entity_link` (IDF 5.0, DEC-IDF-21).
-- No linkage table is added here. Note: on production `subdomain_entity_link` is a VIEW
-- scoped to `pillar_enum`, which does not include briefings; how (or whether) a briefing's
-- own sub-domain tagging reaches it is a follow-on decision, not made in this migration.
--
-- `source_refs` is checked non-empty when status = 'published': a published briefing
-- without sources cannot exist.
--
-- RLS: enabled here. anon may SELECT published rows only. No anon/authenticated writes;
-- writes go through the service role (which bypasses RLS).

create table public.briefings (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  tier               text check (tier in ('deep','standard','profile')),
  status             text not null default 'planned'
                       check (status in ('planned','draft','qa','published','retired')),
  page_target        int check (page_target is null or page_target > 0),
  sector_id          text references public.faraday_domains (domain_code)
                       on update cascade on delete restrict,
  thread_id          text references public.faraday_subdomains (subdomain_code)
                       on update cascade on delete restrict,
  theme_tags         text[] not null default '{}',
  source_refs        jsonb,
  institution_id     text references public.institutions (institution_uid)
                       on update cascade on delete restrict,
  company_id         text references public.companies (company_uid)
                       on update cascade on delete restrict,
  airtable_record_id text unique,  -- migration trail only
  version            int not null default 1 check (version >= 1),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,
  constraint briefings_published_requires_source_refs check (
    status <> 'published'
    or (
      source_refs is not null
      and source_refs not in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb)
    )
  )
);

comment on table public.briefings is
  'BL-03 / FDY-169: canonical Briefing Library record (replaces the Airtable Briefing Library). '
  'Taxonomy and entity keys reference IDF 5.0 tables; entity-to-sub-domain links live in subdomain_entity_link.';
comment on column public.briefings.sector_id is 'faraday_domains.domain_code (IDF 5.0). Nullable until mapping confirmed.';
comment on column public.briefings.thread_id is 'faraday_subdomains.subdomain_code (IDF 5.0, D#.#). Nullable until mapping confirmed.';
comment on column public.briefings.airtable_record_id is 'Migration trail only — the Airtable Briefing Library record id.';

create index briefings_status_idx         on public.briefings (status);
create index briefings_sector_id_idx      on public.briefings (sector_id);
create index briefings_thread_id_idx      on public.briefings (thread_id);
create index briefings_institution_id_idx on public.briefings (institution_id);
create index briefings_company_id_idx     on public.briefings (company_id);
create index briefings_theme_tags_gin     on public.briefings using gin (theme_tags);

create or replace function public.briefings_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger briefings_touch_updated_at
  before update on public.briefings
  for each row execute function public.briefings_touch_updated_at();

revoke execute on function public.briefings_touch_updated_at() from public, anon, authenticated;

-- RLS ----------------------------------------------------------------------
alter table public.briefings enable row level security;

revoke insert, update, delete, truncate, references, trigger on public.briefings from anon;
revoke insert, update, delete, truncate, references, trigger on public.briefings from authenticated;
grant select on public.briefings to anon;

create policy briefings_anon_select_published
  on public.briefings
  for select
  to anon
  using (status = 'published');
