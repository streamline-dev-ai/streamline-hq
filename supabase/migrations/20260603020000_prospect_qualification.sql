-- ============================================================================
-- 20260603020000_prospect_qualification.sql
-- Lead qualification fields on streamline_hq.prospects.
-- The qualifier classifies whether a prospect already has a website and/or an
-- online booking system, so outreach only targets those that don't.
-- ============================================================================

ALTER TABLE streamline_hq.prospects
  ADD COLUMN IF NOT EXISTS has_website        boolean,
  ADD COLUMN IF NOT EXISTS has_booking_system boolean,
  ADD COLUMN IF NOT EXISTS booking_platform   text,
  ADD COLUMN IF NOT EXISTS lead_temp          text,
  ADD COLUMN IF NOT EXISTS qualified_at       timestamptz;

-- Constrain lead_temp to the four buckets (NULL = not yet qualified).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prospects_lead_temp_chk'
  ) THEN
    ALTER TABLE streamline_hq.prospects
      ADD CONSTRAINT prospects_lead_temp_chk
      CHECK (lead_temp IS NULL OR lead_temp IN ('hot','warm','cold','unknown'));
  END IF;
END $$;

-- Fast lookup for "ready to contact" prospects.
CREATE INDEX IF NOT EXISTS prospects_lead_temp_idx ON streamline_hq.prospects (lead_temp);

-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- ALTER TABLE streamline_hq.prospects DROP CONSTRAINT IF EXISTS prospects_lead_temp_chk;
-- DROP INDEX IF EXISTS streamline_hq.prospects_lead_temp_idx;
-- ALTER TABLE streamline_hq.prospects
--   DROP COLUMN IF EXISTS has_website, DROP COLUMN IF EXISTS has_booking_system,
--   DROP COLUMN IF EXISTS booking_platform, DROP COLUMN IF EXISTS lead_temp,
--   DROP COLUMN IF EXISTS qualified_at;
