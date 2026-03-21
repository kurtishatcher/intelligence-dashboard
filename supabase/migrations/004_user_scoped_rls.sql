-- User-Scoped RLS — Eliminate all rls_policy_always_true warnings
-- Migration: 004
-- Date: 2026-03-18
-- Purpose: Add user_id to session-based tables, backfill, rewrite policies
-- Backfill user: 39eeaa7b-8771-41e8-bc77-4454777fa99c (sole auth user)

-- ============================================================
-- 1. Add user_id columns (nullable first for backfill)
-- ============================================================
ALTER TABLE cc_executions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE cc_outputs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE cc_proposal_outcomes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE competitor_intel ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE et_api_costs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE et_roi_snapshots ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE et_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE et_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE et_uploads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE federal_opportunities ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE ks_queries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ============================================================
-- 2. Backfill existing rows
-- ============================================================
UPDATE cc_executions SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE cc_outputs SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE cc_proposal_outcomes SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE competitor_intel SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE et_api_costs SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE et_roi_snapshots SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE et_settings SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE et_transactions SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE et_uploads SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE federal_opportunities SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;
UPDATE ks_queries SET user_id = '39eeaa7b-8771-41e8-bc77-4454777fa99c' WHERE user_id IS NULL;

-- ============================================================
-- 3. Set default for new rows (auto-populate from auth context)
-- ============================================================
ALTER TABLE cc_executions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE cc_outputs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE cc_proposal_outcomes ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE competitor_intel ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE et_api_costs ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE et_roi_snapshots ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE et_settings ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE et_transactions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE et_uploads ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE federal_opportunities ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE ks_queries ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ============================================================
-- 4. Drop old always-true policies
-- ============================================================
-- Command Center
DROP POLICY IF EXISTS "authenticated_insert_cc_executions" ON cc_executions;
DROP POLICY IF EXISTS "authenticated_update_cc_executions" ON cc_executions;
DROP POLICY IF EXISTS "authenticated_insert_cc_outputs" ON cc_outputs;
DROP POLICY IF EXISTS "authenticated_insert_cc_proposal_outcomes" ON cc_proposal_outcomes;
DROP POLICY IF EXISTS "authenticated_update_cc_proposal_outcomes" ON cc_proposal_outcomes;

-- Intelligence Dashboard
DROP POLICY IF EXISTS "authenticated_insert_competitor_intel" ON competitor_intel;
DROP POLICY IF EXISTS "authenticated_update_federal_opportunities" ON federal_opportunities;

-- AI ROI Tracker
DROP POLICY IF EXISTS "Service role full access to api costs" ON et_api_costs;
DROP POLICY IF EXISTS "Authenticated users can insert api costs" ON et_api_costs;
DROP POLICY IF EXISTS "Authenticated users can insert roi_snapshots" ON et_roi_snapshots;
DROP POLICY IF EXISTS "Authenticated users can update roi_snapshots" ON et_roi_snapshots;
DROP POLICY IF EXISTS "Authenticated users can insert settings" ON et_settings;
DROP POLICY IF EXISTS "Authenticated users can update settings" ON et_settings;
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON et_transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON et_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert uploads" ON et_uploads;
DROP POLICY IF EXISTS "Authenticated users can update uploads" ON et_uploads;

-- Knowledge System
DROP POLICY IF EXISTS "authenticated_insert_ks_queries" ON ks_queries;

-- ============================================================
-- 5. Create user-scoped policies (using (select auth.uid()) for perf)
-- ============================================================

-- Command Center
CREATE POLICY "cc_executions_insert" ON cc_executions FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "cc_executions_update" ON cc_executions FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "cc_outputs_insert" ON cc_outputs FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "cc_proposal_outcomes_insert" ON cc_proposal_outcomes FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "cc_proposal_outcomes_update" ON cc_proposal_outcomes FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Intelligence Dashboard
CREATE POLICY "competitor_intel_insert" ON competitor_intel FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "federal_opportunities_update" ON federal_opportunities FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- AI ROI Tracker
CREATE POLICY "et_api_costs_insert" ON et_api_costs FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_roi_snapshots_insert" ON et_roi_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_roi_snapshots_update" ON et_roi_snapshots FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_settings_insert" ON et_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_settings_update" ON et_settings FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_transactions_insert" ON et_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_transactions_update" ON et_transactions FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_uploads_insert" ON et_uploads FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "et_uploads_update" ON et_uploads FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Knowledge System
CREATE POLICY "ks_queries_insert" ON ks_queries FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));
