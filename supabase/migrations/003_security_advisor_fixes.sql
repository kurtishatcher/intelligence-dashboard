-- Security Advisor Fixes — All Projects on Shared Instance
-- Migration: 003 (intelligence-dashboard repo)
-- Date: 2026-03-18
-- Purpose: Resolve all Supabase Security Advisor warnings
-- Covers: function_search_path_mutable, extension_in_public,
--         auth_rls_initplan, multiple_permissive_policies

-- ============================================================
-- 1. Fix: extension_in_public — move vector to extensions schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- ============================================================
-- 2. Fix: function_search_path_mutable — ks_match_chunks
--    Also update to use extensions.vector after schema move
-- ============================================================
CREATE OR REPLACE FUNCTION ks_match_chunks(
  query_embedding extensions.vector(1024),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  section_title TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    ks_chunks.id,
    ks_chunks.document_id,
    ks_chunks.content,
    ks_chunks.section_title,
    1 - (ks_chunks.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.ks_chunks
  WHERE 1 - (ks_chunks.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY ks_chunks.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- 3. Fix: multiple_permissive_policies — dd_feeds and inf_feeds
--    Remove overlapping ALL policies (keep specific read policies)
-- ============================================================
DROP POLICY IF EXISTS "dd_feeds_auth_all" ON dd_feeds;
DROP POLICY IF EXISTS "inf_feeds_auth_all" ON inf_feeds;

-- ============================================================
-- 4. Fix: auth_rls_initplan — wrap auth.uid() in (select ...)
--    Research Pipeline (rp_) — 7 policies
-- ============================================================
DROP POLICY IF EXISTS "Users see own executions" ON rp_executions;
DROP POLICY IF EXISTS "Users insert own executions" ON rp_executions;
DROP POLICY IF EXISTS "Users update own executions" ON rp_executions;
DROP POLICY IF EXISTS "Users see own reports" ON rp_reports;
DROP POLICY IF EXISTS "Users insert own reports" ON rp_reports;
DROP POLICY IF EXISTS "Users see own documents" ON rp_documents;
DROP POLICY IF EXISTS "Users insert own documents" ON rp_documents;

CREATE POLICY "Users see own executions" ON rp_executions FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own executions" ON rp_executions FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users update own executions" ON rp_executions FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users see own reports" ON rp_reports FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own reports" ON rp_reports FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users see own documents" ON rp_documents FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users insert own documents" ON rp_documents FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- 4b. One-Center Ecosystem (oe_) — 15 policies
-- ============================================================
DROP POLICY IF EXISTS "oe_workflows_select" ON oe_workflows;
DROP POLICY IF EXISTS "oe_workflows_insert" ON oe_workflows;
DROP POLICY IF EXISTS "oe_workflows_update" ON oe_workflows;
DROP POLICY IF EXISTS "oe_workflows_delete" ON oe_workflows;
DROP POLICY IF EXISTS "oe_executions_select" ON oe_executions;
DROP POLICY IF EXISTS "oe_executions_insert" ON oe_executions;
DROP POLICY IF EXISTS "oe_executions_update" ON oe_executions;
DROP POLICY IF EXISTS "oe_notifications_select" ON oe_notifications;
DROP POLICY IF EXISTS "oe_notifications_insert" ON oe_notifications;
DROP POLICY IF EXISTS "oe_notifications_update" ON oe_notifications;
DROP POLICY IF EXISTS "oe_content_queue_select" ON oe_content_queue;
DROP POLICY IF EXISTS "oe_content_queue_insert" ON oe_content_queue;
DROP POLICY IF EXISTS "oe_content_queue_update" ON oe_content_queue;
DROP POLICY IF EXISTS "oe_content_queue_delete" ON oe_content_queue;

CREATE POLICY "oe_workflows_select" ON oe_workflows FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "oe_workflows_insert" ON oe_workflows FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "oe_workflows_update" ON oe_workflows FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "oe_workflows_delete" ON oe_workflows FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "oe_executions_select" ON oe_executions FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "oe_executions_insert" ON oe_executions FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "oe_executions_update" ON oe_executions FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "oe_notifications_select" ON oe_notifications FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "oe_notifications_insert" ON oe_notifications FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "oe_notifications_update" ON oe_notifications FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));

CREATE POLICY "oe_content_queue_select" ON oe_content_queue FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "oe_content_queue_insert" ON oe_content_queue FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "oe_content_queue_update" ON oe_content_queue FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "oe_content_queue_delete" ON oe_content_queue FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

-- ============================================================
-- 4c. Public Payments (pp_) — 3 policies
-- ============================================================
DROP POLICY IF EXISTS "pp_customers_select" ON pp_customers;
DROP POLICY IF EXISTS "pp_orders_select" ON pp_orders;
DROP POLICY IF EXISTS "pp_assessments_select" ON pp_assessments;

CREATE POLICY "pp_customers_select" ON pp_customers
  FOR SELECT USING ((select auth.uid()) = auth_id);

CREATE POLICY "pp_orders_select" ON pp_orders
  FOR SELECT USING (
    customer_id IN (SELECT id FROM pp_customers WHERE auth_id = (select auth.uid()))
  );

CREATE POLICY "pp_assessments_select" ON pp_assessments
  FOR SELECT USING (
    customer_id IN (SELECT id FROM pp_customers WHERE auth_id = (select auth.uid()))
  );
