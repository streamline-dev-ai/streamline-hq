-- ============================================================================
-- 20260603000001_rls_lockdown_prospect_engagement_view.sql
-- prospect_engagement is a SECURITY DEFINER view that still exposed prospect
-- data to anon after the table lockdown (views aren't covered by the table loop
-- in 20260603000000). Make it respect the caller's RLS and deny anon.
-- ============================================================================
ALTER VIEW streamline_hq.prospect_engagement SET (security_invoker = on);
REVOKE ALL ON streamline_hq.prospect_engagement FROM anon;
REVOKE ALL ON streamline_hq.prospect_engagement FROM PUBLIC;
GRANT SELECT ON streamline_hq.prospect_engagement TO authenticated;
GRANT SELECT ON streamline_hq.prospect_engagement TO service_role;

-- ROLLBACK:
-- ALTER VIEW streamline_hq.prospect_engagement SET (security_invoker = off);
-- GRANT ALL ON streamline_hq.prospect_engagement TO anon;
-- GRANT ALL ON streamline_hq.prospect_engagement TO PUBLIC;
