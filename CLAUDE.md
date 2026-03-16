# Intelligence Dashboard

## Architecture
- Stack: Next.js 16 + Supabase + Vercel
- Deployment: intelligence-dashboard-phi.vercel.app
- GitHub: kurtishatcher/intelligence-dashboard
- Supabase: shared instance `pxjnrkxwocmarwzhzplz` — 6 tables (bare names, no prefix), RLS enabled

## Structure
- `src/` — Next.js app (App Router, TypeScript, Tailwind 4)
- `supabase/` — Database migrations (001 schema + 002 RLS policies)
- `scripts/digests/daily/` — Daily Digest (legacy Python, being replaced by ~/daily-digest web app)
- `scripts/digests/information/` — Information Digest (legacy Python, being replaced by ~/information-digest-web)
- `scripts/digest-sync.sh` — Bidirectional file sync (will be retired after web digest migration)

## Data Collectors (all 4 active)
- `/api/collectors/sam` — SAM.gov Federal solicitations. Queries each NAICS code in parallel. Requires `SAM_GOV_API_KEY` + `CRON_SECRET`
- `/api/collectors/usaspending` — USAspending.gov contract awards. Public API. Retry-on-500 fallback
- `/api/collectors/news` — RSS feeds for 3 competitors (Deloitte, McKinsey, BCG). Claude Haiku classifies for OD relevance. Inserts to `competitor_intel`
- `/api/collectors/jobs` — Perplexity API job search for 7 competitors. Claude Haiku extracts structured data. Inserts to `job_postings`. Requires `PERPLEXITY_API_KEY`

## Cron Pipeline (3 phases, biweekly 1st/15th 6am UTC)
- `/api/cron/collect` — Orchestrates all operations:
  1. Data collection (parallel): SAM.gov + USAspending (20s timeout each)
  2. Intelligence collection (parallel): News RSS + Jobs (15s timeout each)
  3. Synthesis: Claude brief generation (15s timeout)
- Total ~50s, within 60s Vercel Hobby limit

## Brief Generation
- `/api/brief/generate` — Claude Sonnet 4.6 synthesizes recent data into `intelligence_briefs`
- Structured output: markdown content, highlights (jsonb), competitor_mentions (jsonb), federal_highlights (jsonb)
- Manual trigger via "Generate New Brief" button on `/brief` page
- Automated via cron pipeline (Phase 3)

## Recharts Visualizations (7 charts)
- Overview: Pipeline trend (line), Awards by agency (horizontal bar)
- Federal: Fit score distribution (bar), Opportunities by NAICS (pie)
- Competitors: Intel by type (pie), Intel by significance (bar)
- Brief: Generation trend (area)

## RLS (migration 002)
- Session-based (not user-scoped) — all tables are reference data
- Authenticated users: SELECT on all tables, UPDATE on federal_opportunities (status changes), INSERT on competitor_intel
- Service role (collectors/cron): bypasses RLS automatically

## Authentication
- Supabase Auth middleware on all pages and API routes
- Excluded: `/login`, `/api/cron/*`, `/api/collectors/*`, `/api/brief/*`
- All excluded endpoints validate `CRON_SECRET` independently

## Environment
- `.env.local` — Supabase credentials, ANTHROPIC_API_KEY, SAM_GOV_API_KEY, PERPLEXITY_API_KEY
- Vercel env vars: `CRON_SECRET`, `SAM_GOV_API_KEY`, `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`, Supabase keys

## Legacy Digest Systems (being migrated)
- Python digest scripts remain in `scripts/digests/` until web apps are verified
- launchd services: `com.hatchingsolutions.daily-digest`, `com.hatchingsolutions.information-digest`, `com.hatchingsolutions.digest-sync`
- Will be retired after web digest apps are deployed and validated
