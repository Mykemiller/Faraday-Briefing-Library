-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — query RPCs (FTS + facets + keyset) and the atomic checkout (L2)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Keyset-paginated, faceted, full-text shelf query (§5.2, §11.2) ───────────
-- Cursor is the previous page's last (go_live_date, id), encoded as 'YYYY-MM-DD|id'
-- ('null|id' when the date is null). Ordering: go_live_date desc nulls last, id desc.
create or replace function public.library_search(
  p_q          text default null,
  p_theme      text default null,
  p_domain     text default null,
  p_subdomain  text default null,
  p_company    text default null,
  p_status     text default null,          -- 'Available' | 'Coming Soon' | null (all)
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

-- ── Live facet counts from the cache (§5.2 — every number bound to live data) ─
create or replace function public.library_facets(p_axis text)
  returns table(value text, count bigint)
  language sql stable
  set search_path to 'public', 'pg_temp' as $$
  select v as value, count(*) as count
  from public.library_catalog_cache c,
       lateral unnest(
         case p_axis
           when 'theme'     then c.themes
           when 'domain'    then c.domains
           when 'subdomain' then c.subdomains
           when 'company'   then c.companies
           else '{}'::text[]
         end
       ) as v
  where c.status = 'Available'
  group by v
  order by count desc, value asc;
$$;

-- ── Atomic, idempotent checkout (§10.1, §10.2) ───────────────────────────────
-- One transaction: validate → cost = lines × meter → assert balance → debit (one
-- unlock row) → idempotent-upsert entitlements → clear cart lines → bump download
-- counters. The session idempotency token is the processed_checkouts PK: a duplicate
-- replays the prior result with no double-debit. Cost binds to product_meters — never a literal.
create or replace function public.library_checkout(
  p_sub               uuid,
  p_idempotency_token uuid
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prior   public.processed_checkouts%rowtype;
  v_meter   integer;
  v_lines   text[];
  v_cost    integer;
  v_balance integer;
  v_tx_id   uuid;
  v_result  jsonb;
begin
  -- Replay-safety: if this token already processed, return the stored result unchanged (L2).
  select * into v_prior from public.processed_checkouts where idempotency_token = p_idempotency_token;
  if found then
    return v_prior.result || jsonb_build_object('replayed', true);
  end if;

  -- Meter is config in Supabase, Myke-governed (FAR-46). Never a code literal (§8).
  select tokens_cost into v_meter from public.product_meters where product_key = 'briefing_library';
  if v_meter is null then
    return jsonb_build_object('error','meter_unset',
      'message','product_meters[briefing_library] not set — pending FAR-46 sign-off.');
  end if;

  -- Validate cart against inventory + entitlements: drop Owned/retired lines (§10.1).
  select array_agg(ci.briefing_id) into v_lines
  from public.library_cart_items ci
  join public.library_catalog_cache cc on cc.id = ci.briefing_id and cc.status = 'Available'
  where ci.subscriber_id = p_sub
    and not exists (
      select 1 from public.library_entitlements e
      where e.subscriber_id = p_sub and e.briefing_id = ci.briefing_id
    );

  if v_lines is null or array_length(v_lines,1) is null then
    return jsonb_build_object('error','empty_cart','message','No acquirable lines in cart.','balance', jw_token_balance(p_sub));
  end if;

  v_cost := array_length(v_lines,1) * v_meter;
  v_balance := jw_token_balance(p_sub);
  if v_balance < v_cost then
    return jsonb_build_object('error','insufficient_tokens','cost',v_cost,'balance',v_balance,'meter',v_meter);
  end if;

  -- Debit: a single wallet 'unlock' row (reuses the JW wallet balance math; no schema fork).
  insert into public.token_transactions(subscriber_id, jurisdiction_id, tokens_burned, kind, unlocked_until)
  values (p_sub, null, v_cost, 'unlock', null)
  returning id into v_tx_id;

  -- Idempotent entitlement grant (§9.3 unique constraint).
  insert into public.library_entitlements(subscriber_id, briefing_id, source)
  select p_sub, unnest(v_lines), 'checkout'
  on conflict (subscriber_id, briefing_id) do nothing;

  -- Clear the acquired cart lines.
  delete from public.library_cart_items where subscriber_id = p_sub and briefing_id = any(v_lines);

  -- Increment Download counter mirror in the cache; the sync writes back to Airtable (§10.3).
  update public.library_catalog_cache set download_count = download_count + 1 where id = any(v_lines);

  v_result := jsonb_build_object(
    'ok', true,
    'charged', v_cost,
    'meter', v_meter,
    'owned', to_jsonb(v_lines),
    'balance', v_balance - v_cost
  );

  -- Log under the unique token. A concurrent duplicate that raced past the first SELECT
  -- collides here and we replay the now-stored result (no second debit).
  begin
    insert into public.processed_checkouts(idempotency_token, subscriber_id, product_key, briefing_ids, tokens_spent, token_tx_id, result)
    values (p_idempotency_token, p_sub, 'briefing_library', v_lines, v_cost, v_tx_id, v_result);
  exception when unique_violation then
    -- Extremely rare race: undo this transaction's debit and serve the winner's result.
    raise exception 'duplicate_checkout_token' using errcode = '40001';
  end;

  return v_result;
end
$function$;

comment on function public.library_checkout(uuid, uuid) is
  'Atomic, idempotent Briefing Library checkout (§10). Cost = acquirable lines × product_meters[briefing_library]. Replay-safe via processed_checkouts unique token.';

-- Hardening: the SECURITY DEFINER checkout is invoked ONLY by the server (service role).
-- Revoke from PUBLIC (execute is granted to PUBLIC by default) so no client session can call it.
revoke execute on function public.library_checkout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.library_checkout(uuid, uuid) to service_role;
