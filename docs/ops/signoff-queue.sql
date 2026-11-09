-- BL2-06 (FDY-282): the daily sign-off view for the Briefing Library V2.0 review chain.
--
-- NOT APPLIED by the PR that adds it (Founder decision 4, 2026-11-09: the merged PR is the approval
-- to apply). Additive: one view, service_role only. Rollback: drop view public.v_briefing_signoff_queue.
--
-- A draft appears here when its CURRENT version has a G3-XCHECK PASS row (which implies G1-AUTO and
-- G2-PANEL PASS rows for the same version, since the chain only runs a gate after the previous one
-- passed) and the live briefings row still sits at an older version — i.e. it is QUEUED and waiting
-- for Myke's sign-off (Brand Bible §07). Promotion remains a separate human step:
-- select briefings_version_promote(briefing_id, version), then an explicit status UPDATE.
--
-- Columns: briefing, version, lane, tier, pages (G1 score = measured PDF pages), scores (G2 panel
-- scores + G1/G3 detail), preview path (the rendered PDF G1 wrote). briefing_reviews.notes carries a
-- JSON document per gate (see docs/ops/review-chain.md §Rows); it is parsed defensively here.

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
  b.id                                   as briefing_id,
  b.title,
  v.version,
  replace(v.job, 'lane-', '')            as lane,
  v.tier,
  v.briefing_type,
  g1.score::int                          as pages,
  jsonb_build_object(
    'panel',       g2.notes -> 'scores',
    'panel_min',   g2.score,
    'panel_preset', g2.notes ->> 'preset',
    'buyer_could_act', g2.notes -> 'could_a_buyer_act',
    'xcheck',      jsonb_build_object('facts', g3.notes ->> 'a', 'voice', g3.notes ->> 'b',
                                      'numbers_checked', g3.notes -> 'numbers_checked',
                                      'unverifiable', g3.notes -> 'unverifiable'),
    'g1_stats',    g1.notes -> 'stats'
  )                                      as scores,
  g1.notes ->> 'preview_path'            as preview_path,
  g3.created_at                          as queued_at,
  v.created_at                           as drafted_at,
  v.byline,
  v.hypothesis
from public.briefings_versions v
join public.briefings b on b.id = v.briefing_id
join latest g3 on g3.briefing_id = v.briefing_id and g3.version = v.version and g3.gate = 'G3-XCHECK' and g3.result = 'PASS'
left join latest g2 on g2.briefing_id = v.briefing_id and g2.version = v.version and g2.gate = 'G2-PANEL'
left join latest g1 on g1.briefing_id = v.briefing_id and g1.version = v.version and g1.gate = 'G1-AUTO'
where v.kind = 'draft'
  and v.version > b.version                              -- not yet promoted
  and coalesce((g3.notes ->> 'parked')::boolean, false) is false
order by g3.created_at desc;

comment on view public.v_briefing_signoff_queue is
  'BL2-06 (FDY-282): staged drafts whose current version passed G1-AUTO, G2-PANEL and G3-XCHECK and await Myke''s sign-off. Read-only; promotion is briefings_version_promote().';

revoke all on public.v_briefing_signoff_queue from public, anon, authenticated;
grant select on public.v_briefing_signoff_queue to service_role;
