# Intelligence Dashboard

## Architecture
- Stack: Next.js 16 + Supabase + Vercel
- Deployment: intelligence-dashboard-phi.vercel.app
- GitHub: kurtishatcher/intelligence-dashboard

## Structure
- `src/` — Next.js app (App Router, TypeScript, Tailwind 4)
- `supabase/` — Database migrations (6 tables: competitors, intel, opportunities, awards, jobs, briefs)
- `scripts/digests/daily/` — Daily Digest (Tue/Wed/Thu 6am, Python + Claude Haiku + SMTP)
- `scripts/digests/information/` — Information Digest (Mon/Fri 6am, Python + Claude Haiku + SMTP)
- `scripts/digest-sync.sh` — Bidirectional file sync between repo and Desktop copies

## File Sync Protocol
- Digest scripts exist in two locations: this repo and Desktop (`~/Desktop/_Claude_AI_docs/_Projects/AI_Product_Development/Building Your Virtual Team of 50/`)
- `digest-sync.sh` runs at login via launchd (`com.hatchingsolutions.digest-sync`)
- Desktop → Repo: automatic (fswatch, always on)
- Repo → Desktop: manual — run `~/intelligence-dashboard/scripts/digest-sync.sh once` from Terminal
- Synced files: `morning_digest.py`, `requirements.txt`, `.env`, `.env.example`, `CLAUDE.md`, `TASKS.md`
- Runtime artifacts (cache, output, logs) are independent per location

## launchd Services
- `com.hatchingsolutions.daily-digest` — Tue/Wed/Thu 6am
- `com.hatchingsolutions.information-digest` — Mon/Fri 6am
- `com.hatchingsolutions.digest-sync` — runs at login, keeps Desktop→Repo in sync

## Environment
- `.env.local` — Supabase credentials (Next.js app)
- `scripts/digests/*/. env` — Anthropic API key + SMTP credentials (per-digest)
- All `.env` files gitignored; `.env.example` templates committed
