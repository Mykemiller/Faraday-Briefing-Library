-- FBL 1.0 interim guard (until PR #2's sync ships to the deployment the cron runs on):
--
-- 1. The CURRENTLY DEPLOYED sync prunes every row not present in Airtable — including the
--    FBL 1.0 `seed-` rows — every cron tick. A BEFORE DELETE trigger spares them so the
--    designed shelf survives. The new sync (src/lib/sync.ts) excludes seed rows from its
--    prune anyway; DROP this trigger when the seeds are deliberately retired (FAR-213).
--
-- 2. The Airtable base holds ~357 untitled placeholder records the deployed sync keeps
--    mirroring. A briefing with no title is editorial scaffolding, not shelf stock — the
--    shelf query excludes them. The new sync stops mirroring them entirely, after which
--    this predicate matches nothing.

create or replace function public.library_protect_seed_rows()
returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp' as $$
begin
  if old.id like 'seed-%' then
    return null; -- veto the delete; seeds are retired deliberately, not by the sync prune
  end if;
  return old;
end $$;

drop trigger if exists library_catalog_cache_seed_guard on public.library_catalog_cache;
create trigger library_catalog_cache_seed_guard
  before delete on public.library_catalog_cache
  for each row execute function public.library_protect_seed_rows();

-- Shelf hygiene: never surface title-less records.
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
    and btrim(coalesce(c.briefing_title,'')) not in ('', 'Untitled briefing')
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
