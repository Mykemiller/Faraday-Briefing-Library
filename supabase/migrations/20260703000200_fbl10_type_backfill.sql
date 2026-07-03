-- FBL 1.0 follow-up: briefing_type/byline pre-existed in the live cache as nullable
-- columns (no default), so the add-column defaults in 20260703000100 never applied.
-- Backfill with the sync's IDF derivation, then tighten to the intended contract.

update public.library_catalog_cache set briefing_type =
  case
    when coalesce(array_length(subdomains,1),0) > 0 then 'thread'
    when coalesce(array_length(domains,1),0)    > 0 then 'sector'
    when coalesce(array_length(companies,1),0)  > 0 then 'keyplayer'
    else 'theater'
  end
where briefing_type is null or briefing_type not in ('theater','sector','thread','keyplayer','jurisdiction');

update public.library_catalog_cache set byline =
  case when briefing_type = 'theater' then 'Mach' else 'Gilbert' end
where byline is null or byline not in ('Gilbert','Mach');

alter table public.library_catalog_cache
  alter column briefing_type set default 'sector',
  alter column briefing_type set not null,
  alter column byline set default 'Gilbert',
  alter column byline set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'library_catalog_cache_briefing_type_check') then
    alter table public.library_catalog_cache
      add constraint library_catalog_cache_briefing_type_check
      check (briefing_type in ('theater','sector','thread','keyplayer','jurisdiction'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'library_catalog_cache_byline_check') then
    alter table public.library_catalog_cache
      add constraint library_catalog_cache_byline_check
      check (byline in ('Gilbert','Mach'));
  end if;
end $$;
