-- ============================================================================
-- 20260603030000_rls_lockdown_payments.sql
-- public.payments was created after the initial lockdown audit and had RLS off
-- with open anon grants. Lock it down as an internal table (anon denied,
-- authenticated full, service_role bypasses RLS).
-- NOTE: if a payment-provider webhook writes this table, confirm it uses the
-- service-role key (it bypasses RLS) — NOT the anon key.
-- ============================================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payments FROM anon;
REVOKE ALL ON public.payments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
DROP POLICY IF EXISTS hq_authenticated_all ON public.payments;
CREATE POLICY hq_authenticated_all ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ROLLBACK:
-- DROP POLICY IF EXISTS hq_authenticated_all ON public.payments;
-- ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON public.payments TO anon; GRANT ALL ON public.payments TO PUBLIC;
