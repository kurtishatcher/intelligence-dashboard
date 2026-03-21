-- Add fit-scoring skill output columns to federal_opportunities
-- Stores the full scoring breakdown from lib/skills/fit-scoring.ts

ALTER TABLE federal_opportunities
  ADD COLUMN IF NOT EXISTS pursuit_recommendation text,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS flags text[] DEFAULT '{}';
