-- FDY-181 (FDY-160 carry-over): editorial columns on public.briefings.
--
-- Approved by Myke 2026-10-13, exactly these five:
--   briefing_type   theater / sector / thread
--   byline          Gilbert / Mach
--   hypothesis      text
--   contents        text[]
--   last_refreshed  timestamptz
--
-- Whether "company" becomes a fourth briefing_type is still Myke's call. It is not included;
-- adding it later means replacing briefings_briefing_type_check with a four-value list.
--
-- All columns are nullable. The Airtable Briefing Library has none of these fields, so the
-- BL-04 migration loaded nothing into them; editors fill them in Supabase.
-- No other gap from docs/migration/airtable-field-map.md (G1, G2, G5–G8) is added here.
-- RLS and grants are unchanged: the existing anon SELECT policy covers the new columns.

alter table public.briefings
  add column if not exists briefing_type  text,
  add column if not exists byline         text,
  add column if not exists hypothesis     text,
  add column if not exists contents       text[],
  add column if not exists last_refreshed timestamptz;

alter table public.briefings
  drop constraint if exists briefings_briefing_type_check,
  add constraint briefings_briefing_type_check
    check (briefing_type is null or briefing_type in ('theater', 'sector', 'thread'));

alter table public.briefings
  drop constraint if exists briefings_byline_check,
  add constraint briefings_byline_check
    check (byline is null or byline in ('Gilbert', 'Mach'));

comment on column public.briefings.briefing_type  is 'FDY-181: theater | sector | thread (public vocabulary). "company" not approved yet.';
comment on column public.briefings.byline         is 'FDY-181: Gilbert | Mach.';
comment on column public.briefings.hypothesis     is 'FDY-181: the brief''s opening hypothesis.';
comment on column public.briefings.contents       is 'FDY-181: table of contents, one item per element.';
comment on column public.briefings.last_refreshed is 'FDY-181: when the brief content was last refreshed.';
