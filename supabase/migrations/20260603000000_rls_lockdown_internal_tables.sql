-- ============================================================================
-- 20260603000000_rls_lockdown_internal_tables.sql
-- ----------------------------------------------------------------------------
-- SECURITY LOCKDOWN for project lpjwfjkgqpgydzozuusj (streamline-admin).
--
-- WHY: This Supabase project is SHARED between the public booking page (which
-- ships the ANON key to every visitor's browser) and the internal HQ/admin app
-- + lead engine. Before this migration, ~36 internal tables across the `public`
-- and `streamline_hq` schemas had RLS DISABLED and granted ALL privileges to
-- the `anon` role — so anyone holding the public anon key could read/write
-- leads, invoices, quotes, clients, prospects, messages, gap_analyses, etc.
--
-- WHAT THIS DOES:
--   * Booking tables (businesses, services, blocked_slots, stylists): anon keeps
--     SELECT only. anon INSERT/UPDATE/DELETE revoked. (RLS already enabled.)
--   * bookings: anon keeps SELECT (public page reads it to compute availability)
--     + INSERT (public creates bookings). anon UPDATE/DELETE revoked.
--     NOTE: owner/admin writes already go through the booking-page service-role
--     API functions (api/admin-save.js etc.), so this does not break them.
--   * Every internal table (public + streamline_hq): RLS ENABLED, ALL privileges
--     REVOKED from anon and PUBLIC, full access GRANTED to `authenticated`
--     (the logged-in HQ app) via a permissive policy. `service_role` (n8n,
--     server functions) bypasses RLS entirely, so the lead engine is unaffected.
--
-- AUTH MODEL: the HQ app now signs in with Supabase Auth (see src/components/
-- AuthGate.tsx) and therefore queries as `authenticated`. Deploy that frontend
-- build and sign in before/at the same time as applying this migration.
--
-- REVERSIBLE: a full rollback is provided (commented) at the bottom. No DROPs of
-- tables/columns/data — only RLS flags, grants, and policies are changed.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. BOOKING TABLES — public read only (RLS already enabled; policies already
--    grant anon SELECT + bookings INSERT). Here we tighten the loose GRANTs so
--    anon physically cannot write, as defense-in-depth on top of RLS.
-- ----------------------------------------------------------------------------

-- Read-only public reference tables: SELECT stays, everything else revoked.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.businesses, public.services, public.blocked_slots, public.stylists
  FROM anon;

-- bookings: public page reads (availability) and inserts (new booking). No edits.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.bookings
  FROM anon;

-- ----------------------------------------------------------------------------
-- 2. INTERNAL TABLES — deny anon entirely, allow authenticated, RLS on.
--    Looped over both schemas. service_role keeps its grants and bypasses RLS.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND (
        (n.nspname = 'public' AND c.relname NOT IN
          ('businesses','services','blocked_slots','stylists','bookings'))
        OR n.nspname = 'streamline_hq'
      )
  LOOP
    -- Enable row level security (deny-by-default once anon has no policy).
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', r.schema_name, r.table_name);

    -- Remove all anon / PUBLIC access at the GRANT layer.
    EXECUTE format('REVOKE ALL ON %I.%I FROM anon;', r.schema_name, r.table_name);
    EXECUTE format('REVOKE ALL ON %I.%I FROM PUBLIC;', r.schema_name, r.table_name);

    -- The logged-in HQ app (authenticated role) needs full CRUD.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO authenticated;', r.schema_name, r.table_name);

    -- Single permissive policy for authenticated; service_role bypasses RLS.
    EXECUTE format('DROP POLICY IF EXISTS hq_authenticated_all ON %I.%I;', r.schema_name, r.table_name);
    EXECUTE format(
      'CREATE POLICY hq_authenticated_all ON %I.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      r.schema_name, r.table_name
    );

    -- Drop a pre-existing ad-hoc policy we are standardising (content_posts).
    EXECUTE format('DROP POLICY IF EXISTS "Enable all for authenticated users" ON %I.%I;', r.schema_name, r.table_name);
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK  (run this block to fully revert — restores the prior open state)
-- ============================================================================
-- BEGIN;
--
-- -- Restore loose anon grants on booking tables.
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   ON public.businesses, public.services, public.blocked_slots, public.stylists TO anon;
-- GRANT UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.bookings TO anon;
--
-- -- Re-open every internal table (disable RLS, restore anon/PUBLIC grants, drop policy).
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT n.nspname AS schema_name, c.relname AS table_name
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE c.relkind = 'r'
--       AND ((n.nspname = 'public' AND c.relname NOT IN
--             ('businesses','services','blocked_slots','stylists','bookings'))
--            OR n.nspname = 'streamline_hq')
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS hq_authenticated_all ON %I.%I;', r.schema_name, r.table_name);
--     EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY;', r.schema_name, r.table_name);
--     EXECUTE format('GRANT ALL ON %I.%I TO anon;', r.schema_name, r.table_name);
--     EXECUTE format('GRANT ALL ON %I.%I TO PUBLIC;', r.schema_name, r.table_name);
--   END LOOP;
-- END $$;
--
-- COMMIT;
-- ============================================================================
