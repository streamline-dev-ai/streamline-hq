-- ============================================================================
-- 20260603010000_lead_engine_suppression.sql
-- POPIA opt-out / suppression for the lead engine (manual-send model).
--
-- prospects.popia_optout / popia_optout_at / status already exist; this adds the
-- suppression_list that the Telegram control handler checks BEFORE generating
-- any wa.me send-link. RLS-locked to match the security lockdown: anon denied,
-- authenticated full, service_role (n8n) bypasses RLS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS streamline_hq.suppression_list (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  uuid REFERENCES streamline_hq.prospects(id) ON DELETE SET NULL,
  phone_e164   text,
  reason       text NOT NULL DEFAULT 'manual_optout',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One suppression row per phone (digits-only E.164). Lets the handler match fast.
CREATE UNIQUE INDEX IF NOT EXISTS suppression_list_phone_uidx
  ON streamline_hq.suppression_list (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS suppression_list_prospect_idx
  ON streamline_hq.suppression_list (prospect_id);

ALTER TABLE streamline_hq.suppression_list ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON streamline_hq.suppression_list FROM anon;
REVOKE ALL ON streamline_hq.suppression_list FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON streamline_hq.suppression_list TO authenticated;
DROP POLICY IF EXISTS hq_authenticated_all ON streamline_hq.suppression_list;
CREATE POLICY hq_authenticated_all ON streamline_hq.suppression_list
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- DROP TABLE IF EXISTS streamline_hq.suppression_list;
