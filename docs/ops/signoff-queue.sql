-- BL2-06 (FDY-282): extends the daily sign-off view for the Briefing Library V2.0 review chain.
--
-- NOT APPLIED by the PR that adds it (Founder decision 4, 2026-11-09: the merged PR is the approval
-- to apply). It MUST be applied AFTER BL2-07's migration 20261109150000_bl2_07_briefing_signoff.sql,
-- which creates `briefing_signoff` and the first version of `v_briefing_signoff_queue`. This file is
-- a CREATE OR REPLACE of that view: the 20 BL2-07 columns are kept verbatim, in order, with the same
-- names and types (Postgres requires that), and six review-chain columns are APPENDED. Nothing that
-- reads the BL2-07 shape breaks. Rollback: re-run §2 of the BL2-07 migration.
--
-- Appended columns (ticket: "briefing, version, lane, tier, pages, scores, preview path"):
--   lane          briefings_versions.job with the `lane-` prefix stripped (theaters, domains, …)
--   pages         measured PDF page count = the G1-AUTO row's score
--   scores        jsonb: G2 panel scores/min/preset/could_a_buyer_act, G3 facts+voice verdicts and the
--                 numbers-checked counts, G1 stats — read from briefing_reviews.notes (a JSON document
--                 per gate, see docs/ops/review-chain.md §7; parsed defensively)
--   preview_path  the Storage path of the PDF G1 rendered (library-previews/review/<id>/v<n>.pdf)
--   queued        true when the current version's latest G3-XCHECK row is PASS and not parked —
--                 i.e. the status log said QUEUED and the draft is waiting for Myke
--   parked        true when the latest row at any gate carries notes.parked = true (PARKED is stored
--                 as result FAIL + notes.parked because of the briefing_reviews result CHECK)
--
-- Daily use:  select briefing_id, title, lane, tier, pages, scores, preview_path
--             from public.v_briefing_signoff_queue where queued and not approved;

create or replace view public.v_briefing_signoff_queue
with (security_invoker = true) as
with latest as (
  select distinct on (r.briefing_id, r.version, r.gate)
         r.briefing_id, r.version, r.gate, r.result, r.score, r.reviewer, r.created_at,
         case when r.notes ~ '^\s*\{' then r.notes::jsonb else jsonb_build_object('text', r.notes) end as notes
  from public.briefing_reviews r
  order by r.briefing_id, r.version, r.gate, r.created_at desc
)
select
  -- ── BL2-07 columns, verbatim and in order ──────────────────────────────────────────────────
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
  s.note          as signoff_note,
  -- ── BL2-06 review-chain columns, appended ──────────────────────────────────────────────────
  replace(v.job, 'lane-', '')            as lane,
  g1.score::int                          as pages,
  jsonb_strip_nulls(jsonb_build_object(
    'panel',           g2.notes -> 'scores',
    'panel_min',       g2.score,
    'panel_preset',    g2.notes ->> 'preset',
    'buyer_could_act', g2.notes -> 'could_a_buyer_act',
    'xcheck',          case when g3.briefing_id is null then null else jsonb_build_object(
                         'facts', g3.notes ->> 'a', 'voice', g3.notes ->> 'b',
                         'numbers_checked', g3.notes -> 'numbers_checked',
                         'unverifiable',    g3.notes -> 'unverifiable') end,
    'g1_stats',        g1.notes -> 'stats'
  ))                                     as scores,
  g1.notes ->> 'preview_path'            as preview_path,
  (g3.result = 'PASS' and not coalesce((g3.notes ->> 'parked')::boolean, false)) as queued,
  coalesce((g1.notes ->> 'parked')::boolean, false)
    or coalesce((g2.notes ->> 'parked')::boolean, false)
    or coalesce((g3.notes ->> 'parked')::boolean, false) as parked
from public.briefings_versions v
join public.briefings b on b.id = v.briefing_id
left join public.briefing_signoff s on s.briefing_id = v.briefing_id and s.version = v.version
left join latest g1 on g1.briefing_id = v.briefing_id and g1.version = v.version and g1.gate = 'G1-AUTO'
left join latest g2 on g2.briefing_id = v.briefing_id and g2.version = v.version and g2.gate = 'G2-PANEL'
left join latest g3 on g3.briefing_id = v.briefing_id and g3.version = v.version and g3.gate = 'G3-XCHECK'
where v.kind = 'draft'
  and v.version > b.version
order by coalesce(s.approved, false) desc, v.created_at asc;

comment on view public.v_briefing_signoff_queue is
  'BL2-07 sign-off queue (staged drafts ahead of the live row, gate verdicts, Myke''s approval) extended by BL2-06 (FDY-282) with lane, pages, scores, preview_path, queued, parked from briefing_reviews. Read-only; promotion is briefings_version_promote().';
