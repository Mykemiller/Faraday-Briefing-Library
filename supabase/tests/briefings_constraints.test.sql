-- BL-03 (FDY-169): constraint tests for public.briefings.
-- Runs inside a transaction and ROLLS BACK — leaves no residue.
-- Requires at least one row in faraday_domains and faraday_subdomains (true on production
-- and on any branch carrying the IDF 5.0 tables). Raises on the first failed assertion.
begin;

do $$
declare
  v_domain    text;
  v_subdomain text;
  v_id        uuid;
begin
  select domain_code, subdomain_code into v_domain, v_subdomain
  from public.faraday_subdomains limit 1;
  if v_subdomain is null then
    raise exception 'precondition: faraday_subdomains has no rows';
  end if;

  -- T1: valid draft insert (no source_refs) succeeds.
  insert into public.briefings (title, tier, status, sector_id, thread_id, theme_tags)
  values ('T1 valid draft', 'standard', 'draft', v_domain, v_subdomain, array['grid'])
  returning id into v_id;
  raise notice 'T1 PASS: valid draft insert';

  -- T2: valid published insert with source_refs succeeds.
  insert into public.briefings (title, tier, status, source_refs, published_at)
  values ('T2 valid published', 'deep', 'published',
          '[{"url":"https://example.gov/doc","title":"Primary source"}]'::jsonb, now());
  raise notice 'T2 PASS: valid published insert';

  -- T3: published without source_refs must fail (NULL, [], {}, json null).
  declare r jsonb;
  begin
    for r in select x from unnest(array[null::jsonb, '[]'::jsonb, '{}'::jsonb, 'null'::jsonb]) x loop
      begin
        insert into public.briefings (title, status, source_refs) values ('T3', 'published', r);
        raise exception 'T3 FAIL: published with source_refs=% was accepted', coalesce(r::text,'SQL NULL');
      exception when check_violation then
        raise notice 'T3 PASS: published with source_refs=% rejected', coalesce(r::text,'SQL NULL');
      end;
    end loop;
  end;

  -- T4: bad tier must fail.
  begin
    insert into public.briefings (title, tier) values ('T4', 'bogus');
    raise exception 'T4 FAIL: bad tier accepted';
  exception when check_violation then
    raise notice 'T4 PASS: bad tier rejected';
  end;

  -- T5: bad status must fail.
  begin
    insert into public.briefings (title, status) values ('T5', 'live');
    raise exception 'T5 FAIL: bad status accepted';
  exception when check_violation then
    raise notice 'T5 PASS: bad status rejected';
  end;

  -- T6: unknown sub-domain FK must fail.
  begin
    insert into public.briefings (title, thread_id) values ('T6', 'D999.999');
    raise exception 'T6 FAIL: unknown thread_id accepted';
  exception when foreign_key_violation then
    raise notice 'T6 PASS: unknown thread_id rejected';
  end;

  -- T7: duplicate airtable_record_id must fail.
  insert into public.briefings (title, airtable_record_id) values ('T7a', 'recTEST0000000001');
  begin
    insert into public.briefings (title, airtable_record_id) values ('T7b', 'recTEST0000000001');
    raise exception 'T7 FAIL: duplicate airtable_record_id accepted';
  exception when unique_violation then
    raise notice 'T7 PASS: duplicate airtable_record_id rejected';
  end;

  -- T8: moving an existing draft to published without sources must fail.
  begin
    update public.briefings set status = 'published' where id = v_id;
    raise exception 'T8 FAIL: draft promoted to published without source_refs';
  exception when check_violation then
    raise notice 'T8 PASS: promotion without source_refs rejected';
  end;

  -- T9: RLS enabled, anon policy is SELECT-only on published rows, no anon/authenticated writes.
  if not (select relrowsecurity from pg_class where oid = 'public.briefings'::regclass) then
    raise exception 'T9 FAIL: RLS not enabled';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='briefings'
             and cmd <> 'SELECT') then
    raise exception 'T9 FAIL: a non-SELECT policy exists';
  end if;
  if has_table_privilege('anon', 'public.briefings', 'INSERT')
     or has_table_privilege('anon', 'public.briefings', 'UPDATE')
     or has_table_privilege('anon', 'public.briefings', 'DELETE')
     or has_table_privilege('authenticated', 'public.briefings', 'INSERT')
     or has_table_privilege('authenticated', 'public.briefings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.briefings', 'DELETE') then
    raise exception 'T9 FAIL: anon/authenticated retains a write privilege';
  end if;
  raise notice 'T9 PASS: RLS on, SELECT-only policy, no anon/authenticated writes';
end $$;

-- T10: as anon, only published rows are visible.
set local role anon;
do $$
begin
  if exists (select 1 from public.briefings where status <> 'published') then
    raise exception 'T10 FAIL: anon can see a non-published row';
  end if;
  if not exists (select 1 from public.briefings where title = 'T2 valid published') then
    raise exception 'T10 FAIL: anon cannot see the published row';
  end if;
  raise notice 'T10 PASS: anon sees published rows only';
end $$;
reset role;

rollback;
