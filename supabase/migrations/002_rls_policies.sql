-- Intelligence Dashboard — RLS Policies
-- Migration: 002
-- Date: 2026-03-16
-- Purpose: Add row-level security to all tables (session-based, not user-scoped)
-- Note: Service role (used by collectors/cron) bypasses RLS automatically

-- Enable RLS on all 6 tables
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE federal_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_briefs ENABLE ROW LEVEL SECURITY;

-- Reference data: authenticated users can read
CREATE POLICY "authenticated_read_competitors"
  ON competitors FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_contract_awards"
  ON contract_awards FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_federal_opportunities"
  ON federal_opportunities FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to update opportunity status (reviewing/pursuing/passed)
CREATE POLICY "authenticated_update_federal_opportunities"
  ON federal_opportunities FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Intelligence data: authenticated can read and insert
CREATE POLICY "authenticated_read_competitor_intel"
  ON competitor_intel FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_competitor_intel"
  ON competitor_intel FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_read_intelligence_briefs"
  ON intelligence_briefs FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_job_postings"
  ON job_postings FOR SELECT TO authenticated USING (true);
