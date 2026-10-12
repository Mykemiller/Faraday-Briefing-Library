-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — checkout lockdown (applied to prod 2026-06-20; backfilled to the repo by FDY-165)
-- PUBLIC holds execute by default; revoke it so only the service role can run the SECURITY DEFINER
-- checkout. Already folded into 20260620064621, so on a fresh replay this is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.library_checkout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.library_checkout(uuid, uuid) to service_role;
