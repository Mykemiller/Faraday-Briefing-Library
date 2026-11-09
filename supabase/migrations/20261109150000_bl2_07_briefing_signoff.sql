-- BL2-07 (FDY-283, release 46-26-v01): Myke's publish sign-off, as a table the publish batch reads.
--
-- NOT APPLIED by the PR that adds it. Founder decision 4 (2026-11-09): the merged PR is the approval
-- to apply the migrations it contains — apply via apply_migration on merge, verify with the §Verify
-- block below, then log to the V2.0 status log. This file is ADDITIVE ONLY: it creates one table,
-- one view and their grants. It removes nothing and rewrites no row, so it is safe to apply
-- unattended under the 2026-11-09 04:22 CT rule; it is held to merge-approval all the same.
--
-- Why a table and not `briefing_reviews.notes = 'MYKE-APPROVED'`: a review row is a gate verdict
-- written by a runner; a sign-off is a human decision. Keeping them apart means a runner can never
-- mint an approval by writing a string, the decision has its own audit columns (who, when, note),
-- and `(briefing_id, version)` is unique — one sign-off per staged version, no ambiguity about which
-- draft Myke approved.
--
-- What this file does, in order:
--   §1  briefing_signoff — one row per (briefing, version) Myke has approved for publication.
--       RLS on, service_role only; anon/authenticated privileges revoked BY NAME.
--   §2  v_briefing_signoff_queue — every staged draft (`briefings_versions.kind = 'draft'`) whose
--       version is ahead of the live row, with its latest G1/G2/G3 verdicts and `approved` = a
--       sign-off row exists. Rows leave the queue when `briefings_version_promote` moves the live
--       row to that version, so a re-run of the publish batch finds nothing to do.
--       security_invoker, no anon/authenticated grant.
--
-- How Myke approves (service role, e.g. the Supabase SQL editor):
--   insert into public.briefing_signoff (briefing_id, version, signed_by, note)
--   values ('<briefing uuid>', <staged version>, 'Myke', 'optional note');
-- then: node scripts/publish-batch.mjs            (dry run — prints the plan)
--       node scripts/publish-batch.mjs --apply    (promotes + publishes, one PUBLISHED line each)
--
-- Rollback (statements in docs/ops/publish-batch.md §Rollback; nothing else depends on these two objects).
--
-- Verify (after apply):
--   select to_regclass('public.briefing_signoff'), to_regclass('public.v_briefing_signoff_queue');
--   select relrowsecurity from pg_class where relname = 'briefing_signoff';                 -- t
--   select count(*) from information_schema.role_table_grants
--     where table_name in ('briefing_signoff','v_briefing_signoff_queue')
--       and grantee in ('anon','authenticated');                                            -- 0
--   select count(*) from public.v_briefing_signoff_queue;                                   -- 0 today (no staged drafts)

-- ───────────────────────────── §1 briefing_signoff ─────────────────────────────
create table if not exists public.briefing_signoff (
  id          uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings (id),
  version     int  not null check (version >= 1),
  approved    boolean not null default true,
  signed_by   text not null default 'Myke',
  note        text,
  signed_at   timestamptz not null default now(),
  constraint briefing_signoff_one_per_version unique (briefing_id, version)
);
comment on table public.briefing_signoff is
  'BL2-07 (FDY-283): Myke''s publish sign-off per (briefing, staged version). approved=true is what '
  'scripts/publish-batch.mjs acts on; approved=false records an explicit hold. Human-written only; '
  'no runner inserts here.';

create index if not exists briefing_signoff_briefing_idx on public.briefing_signoff (briefing_id, version);

alter table public.briefing_signoff enable row level security;
revoke all on table public.briefing_signoff from public, anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'briefing_signoff'
                   and policyname = 'briefing_signoff_service_role_only') then
    create policy briefing_signoff_service_role_only on public.briefing_signoff
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- ───────────────────────────── §2 v_briefing_signoff_queue ─────────────────────────────
create or replace view public.v_briefing_signoff_queue
with (security_invoker = true) as
select
  v.briefing_id,
  v.version,
  b.title,
  b.tier,
  b.briefing_type,
  b.jurisdiction_id,
  b.company_id,
  b.institution_id,
  b.status        as current_status,
  b.version       as current_version,
  b.published_at  as current_published_at,
  v.job,
  v.created_at    as staged_at,
  (select r.result from public.briefing_reviews r
     where r.briefing_id = v.briefing_id and r.version = v.version and r.gate = 'G1-AUTO'
     order by r.created_at desc limit 1) as g1_auto,
  (select r.result from public.briefing_reviews r
     where r.briefing_id = v.briefing_id and r.version = v.version and r.gate = 'G2-PANEL'
     order by r.created_at desc limit 1) as g2_panel,
  (select r.result from public.briefing_reviews r
     where r.briefing_id = v.briefing_id and r.version = v.version and r.gate = 'G3-XCHECK'
     order by r.created_at desc limit 1) as g3_xcheck,
  coalesce(s.approved, false) as approved,
  s.signed_by,
  s.signed_at,
  s.note          as signoff_note
from public.briefings_versions v
join public.briefings b on b.id = v.briefing_id
left join public.briefing_signoff s on s.briefing_id = v.briefing_id and s.version = v.version
where v.kind = 'draft'
  and v.version > b.version
order by coalesce(s.approved, false) desc, v.created_at asc;

comment on view public.v_briefing_signoff_queue is
  'BL2-07 (FDY-283): staged drafts not yet promoted, with latest gate verdicts and Myke''s sign-off. '
  'approved=true rows are what scripts/publish-batch.mjs promotes and publishes. A row leaves the '
  'queue once the live briefings.version reaches it.';

revoke all on table public.v_briefing_signoff_queue from public, anon, authenticated;
grant select on table public.v_briefing_signoff_queue to service_role;

-- ───────────────────────────── verification gate ─────────────────────────────
do $$
declare bad text;
begin
  if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'briefing_signoff') then
    raise exception 'BL2-07: briefing_signoff is not RLS-enabled';
  end if;
  select string_agg(distinct table_name, ', ') into bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('briefing_signoff', 'v_briefing_signoff_queue')
    and grantee in ('anon', 'authenticated');
  if bad is not null then raise exception 'BL2-07: anon/authenticated still hold grants on: %', bad; end if;
end $$;
