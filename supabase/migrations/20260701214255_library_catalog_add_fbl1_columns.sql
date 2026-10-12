-- ─────────────────────────────────────────────────────────────────────────────
-- Briefing Library — FBL1 prototype columns (applied to prod 2026-07-01; backfilled to the repo by FDY-165)
-- Adds the typed-shelf columns as nullable. 20260703175816 later re-declares briefing_type/byline
-- (no-op, since they already exist) and 20260703180145 backfills and tightens them.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE library_catalog_cache
  ADD COLUMN IF NOT EXISTS briefing_type  text CHECK (briefing_type IN ('theater','sector','thread','keyplayer')),
  ADD COLUMN IF NOT EXISTS theater        text,
  ADD COLUMN IF NOT EXISTS sector         text,
  ADD COLUMN IF NOT EXISTS thread         text,
  ADD COLUMN IF NOT EXISTS briefing_group text,
  ADD COLUMN IF NOT EXISTS subtitle       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS byline         text CHECK (byline IN ('Mach','Gilbert')),
  ADD COLUMN IF NOT EXISTS updated_label  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS abstract       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hypothesis     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contents       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sort_order     int  NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'library_catalog_cache'
      AND policyname = 'public read library_catalog_cache'
  ) THEN
    EXECUTE 'CREATE POLICY "public read library_catalog_cache" ON library_catalog_cache FOR SELECT USING (true)';
  END IF;
END $$;
