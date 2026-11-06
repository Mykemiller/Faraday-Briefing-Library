-- BL-05 (FDY-171): cutover — public.briefings is the Briefing Library write path (DEC-IDF-65).
-- NOT APPLIED to production by the PR that adds it; Myke's merge is the cutover approval and this
-- file is applied with it. Documentation only: no column, index, policy or function changes.
--
-- library_catalog_cache stays a TABLE (its generated search_tsv + GIN/keyset indexes and the
-- library_search / library_facets RPCs depend on it). It is now refreshed FROM public.briefings by
-- the sync route (src/lib/sync.ts via src/lib/briefings-source.ts) instead of from Airtable.
-- Rollback: restore the previous two comments (text in git history).

comment on table public.library_catalog_cache is
  'Denormalized read-model of public.briefings (the canonical Briefing Library home since the BL-05 cutover, DEC-IDF-65). Refreshed by the storefront sync route; read-only for subscribers. The retired Airtable table tbl4kbby85nx6Z891 is never read.';

comment on column public.library_catalog_cache.id is
  'Catalog id: briefings.airtable_record_id for rows migrated from Airtable (keeps slugs, cart lines and entitlements stable), else briefings.id. seed-* rows are the FBL 1.0 design seed.';
