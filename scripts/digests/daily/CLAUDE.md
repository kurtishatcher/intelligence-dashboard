# Information Digest Builder

## Architecture
- Tech stack: Python (RSS parsing, orchestration), Claude API Haiku (single-call analysis), SMTP (email delivery)
- Directories: `cache/` (dedup), `output/html/`, `output/markdown/`, `output/json/`, `logs/`
- Dedup: JSON cache with 7-day rolling expiry (hash → timestamp)
- Scheduling: launchd — Tuesday, Wednesday & Thursday at 6:00 AM (fires on wake if missed), delivery by 6:30 AM
- API budget: under $10/month — monitor via `logs/cost_log.csv`

## Conventions
- Source list (16 feeds across 4 categories): HBR, MIT Sloan, McKinsey, TD.org, Anthropic, OpenAI Blog, MIT Tech Review, The Verge AI, Federal News Network, GovExec, Defense.gov, NextGov/FCW, BCG, Bain, Gartner, Deloitte Insights
- Content categories: Strategic Leadership & OD, AI & Technology, Federal Consulting & Market, Consulting Industry
- Scoring: 1–10 relevance scale; threshold at 6/10 — below is dropped
- Per-article output: 2–3 sentence strategic summary, key insight, strategic implication, relevance score
- Digest structure: categorized blocks, scored articles, HIGH PRIORITY items first
- Multi-format delivery: HTML email, Markdown file, JSON export — all three every run
- Single API call: all articles analyzed in one prompt to minimize cost

## Environment
- Repo: `~/Desktop/_Claude_AI_docs/_Projects/AI_Product_Development/Building Your Virtual Team of 50/05 Daily Digest/`
- Run: `python morning_digest.py` (or `--preview` for no email)
- launchd: `com.hatchingsolutions.daily-digest` (plist in `~/Library/LaunchAgents/`)
- Dependencies: `pip install -r requirements.txt`
- Config: copy `.env.example` to `.env` and fill in credentials

## Gotchas
- Deduplication runs against previous 7 days before any API calls — never re-process
- Truncate article summaries to 500 chars in the prompt — cost control
- All analysis in a single Claude API call — do not split by category
- max_tokens capped at 1500
- Target: 15–30 articles per digest, 3–5 high-priority items per day, read time under 15 minutes
- Cost tracking: every run appends to `logs/cost_log.csv` (date, tokens, cost, article counts)
- Integration points: feeds Project 3 (Daily Inspiration), seeds Project 10 (Knowledge System), costs tracked by Project 2 (Expense Tracker)
