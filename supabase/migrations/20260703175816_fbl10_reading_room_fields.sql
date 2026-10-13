-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — FBL 1.0: Reading Room fields + typed shelf search
--
-- Adds the public-vocabulary type (Theater/Sector/Thread/Key Player/Jurisdiction),
-- the byline (Gilbert = empirical, Mach = forward thesis), the hypothesis opener,
-- and the "In this Briefing" contents to the read-model, and extends library_search
-- with a p_type filter. Same keyset semantics, SECURITY INVOKER, search_path pinned.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.library_catalog_cache
  add column if not exists briefing_type text not null default 'sector'
    check (briefing_type in ('theater','sector','thread','keyplayer','jurisdiction')),
  add column if not exists byline text not null default 'Gilbert'
    check (byline in ('Gilbert','Mach')),
  add column if not exists hypothesis text not null default '',
  add column if not exists contents jsonb not null default '[]'::jsonb; -- string[]

create index if not exists library_catalog_cache_type_idx
  on public.library_catalog_cache (briefing_type);

-- The catalog is public shelf-front matter: anonymous browsing is allowed (§4.1),
-- and server components read through the anon client. Writes stay service-role only.
drop policy if exists library_catalog_read_anon on public.library_catalog_cache;
create policy library_catalog_read_anon on public.library_catalog_cache
  for select to anon using (true);

-- ── library_search + p_type (signature change ⇒ drop the old overload first) ──
drop function if exists public.library_search(text,text,text,text,text,text,text,text,integer);

create or replace function public.library_search(
  p_q          text default null,
  p_theme      text default null,
  p_domain     text default null,
  p_subdomain  text default null,
  p_company    text default null,
  p_status     text default null,          -- 'Available' | 'Coming Soon' | null (all)
  p_type       text default null,          -- briefing_type | null (all)
  p_sort       text default 'newest',      -- 'newest' | 'az' | 'downloads'
  p_cursor     text default null,
  p_limit      integer default 48
) returns setof public.library_catalog_cache
  language sql stable
  set search_path to 'public', 'pg_temp' as $$
  with bounds as (
    select
      case when p_cursor is null then null
           when split_part(p_cursor,'|',1) = 'null' then date '0001-01-01'
           else split_part(p_cursor,'|',1)::date end as c_date,
      case when p_cursor is null then null
           else split_part(p_cursor,'|',2) end as c_id
  )
  select c.*
  from public.library_catalog_cache c, bounds b
  where (p_status is null or c.status = p_status)
    and (p_type is null or c.briefing_type = p_type)
    and (p_q is null or p_q = '' or c.search_tsv @@ plainto_tsquery('english', p_q))
    and (p_theme     is null or c.themes     @> array[p_theme])
    and (p_domain    is null or c.domains    @> array[p_domain])
    and (p_subdomain is null or c.subdomains @> array[p_subdomain])
    and (p_company   is null or c.companies  @> array[p_company])
    and (
      p_sort <> 'newest' or p_cursor is null
      or (coalesce(c.go_live_date, date '0001-01-01'), c.id) < (b.c_date, b.c_id)
    )
  order by
    case when p_sort = 'az'        then c.briefing_title end asc,
    case when p_sort = 'downloads' then c.download_count end desc,
    coalesce(c.go_live_date, date '0001-01-01') desc, c.id desc
  limit greatest(1, least(p_limit, 200));
$$;

comment on function public.library_search is
  'Keyset-paginated, faceted, full-text shelf query. FBL 1.0 adds p_type (briefing_type filter).';
