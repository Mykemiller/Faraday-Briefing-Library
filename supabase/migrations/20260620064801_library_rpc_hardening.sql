-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — RPC hardening (applied to prod 2026-06-20; backfilled to the repo by FDY-165)
-- Pins search_path on the invoker RPCs and pulls client execute on the checkout.
-- Already folded into 20260620064547 / 20260620064621, so on a fresh replay this is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

alter function public.library_search(text,text,text,text,text,text,text,text,integer) set search_path to 'public','pg_temp';
alter function public.library_facets(text) set search_path to 'public','pg_temp';
alter function public.current_subscriber_id() set search_path to 'public','pg_temp';
revoke execute on function public.library_checkout(uuid, uuid) from anon, authenticated;
