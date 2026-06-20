-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library token meter — SIGNED OFF (FAR-46), applied 2026-06-20.
--
-- Myke's decision (2026-06-20): the Briefing Library acquisition unit = 10 tokens.
-- This is a DISTINCT product from `briefing` (=5, a single-Briefing unlock); the two
-- are deliberately not reconciled to one value. Status set to 'final' to record the
-- explicit human sign-off that FAR-56 (always-human pricing) requires.
--
-- Commerce remains flag-gated (commerceOn ← FAR-16); seeding only clears the prior
-- meter_unset state so library_checkout() can price acquisitions at the bound value.
-- The cost is read at runtime (src/lib/meter.ts) — never hardcoded in app code.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.product_meters (product_key, display_name, tokens_cost, free, status)
values ('briefing_library', 'Briefing Library', 10, false, 'final')
on conflict (product_key) do update
  set tokens_cost  = excluded.tokens_cost,
      display_name = excluded.display_name,
      free         = excluded.free,
      status       = 'final',
      updated_at   = now();
