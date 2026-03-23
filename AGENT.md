# Intelligence Dashboard — Agent Manifest

## Resilience Standards

### Retry
- Config: `DASHBOARD_RETRY` — 3 attempts, 2,000ms base delay
- Applied to: SAM.gov API, USASpending API, Perplexity AI, Claude Sonnet/Haiku, Supabase writes

### Idempotency
- Upserts on all 5 natural keys: notice_id, award_id, source_url, title+competitor, brief_date
- Re-running the ID for the same week is safe — no duplicate records

### Circuit Breakers
- Dependencies tracked: `claude-api`, `perplexity`, `sam-gov`, `usaspending`, `supabase`

### Graceful Degradation
- FULL: All 5 data types (notices, awards, briefs, competitors, intelligence)
- DEGRADED: SAM.gov + awards (minimum viable brief)
- MINIMAL: SAM.gov notices only
- UNAVAILABLE: All procurement sources down; abort; notify

### Minimum-Data Gate
Before brief generation: confirm at least 1 record exists across all data types.
Do not generate a brief from 0 records — set status to 'pending-synthesis' and notify.

### Event Emission
- Emits: brief_ready, brief_partial, run_failed

### Budget Cap
- $2.00 per run

### Run Log
- Table: `id_runs` (created in Phase 3 migration)
- Fields: id, started_at, status, data_sources_available, brief_generated, error
