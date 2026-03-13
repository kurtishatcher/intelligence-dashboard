-- Intelligence Dashboard Schema
-- Created: 2026-03-13

-- Competitors (7 tracked firms)
create table competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  revenue_billions numeric,
  employee_count integer,
  headquarters text,
  focus_areas text[],
  od_relevance text,
  website_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Competitor intelligence entries
create table competitor_intel (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references competitors(id) on delete cascade,
  type text not null check (type in ('revenue', 'pivot', 'thought_leadership', 'framework', 'offering')),
  title text not null,
  summary text,
  source_url text,
  significance text check (significance in ('low', 'medium', 'high', 'critical')),
  published_at timestamptz,
  created_at timestamptz default now()
);

-- Federal opportunities (SAM.gov structure)
create table federal_opportunities (
  id uuid primary key default gen_random_uuid(),
  notice_id text unique,
  title text not null,
  agency text,
  sub_agency text,
  naics_code text,
  naics_description text,
  estimated_value numeric,
  response_deadline timestamptz,
  set_aside text,
  type text,
  fit_score integer check (fit_score between 0 and 100),
  status text default 'new' check (status in ('new', 'reviewing', 'pursuing', 'passed', 'submitted')),
  notes text,
  source_url text,
  posted_at timestamptz,
  created_at timestamptz default now()
);

-- Contract awards (USAspending structure)
create table contract_awards (
  id uuid primary key default gen_random_uuid(),
  award_id text unique,
  title text not null,
  agency text,
  winner text,
  winner_duns text,
  value numeric,
  duration_months integer,
  naics_code text,
  naics_description text,
  award_date date,
  description text,
  source_url text,
  created_at timestamptz default now()
);

-- Job postings (structure only — not active)
create table job_postings (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references competitors(id) on delete cascade,
  title text not null,
  location text,
  department text,
  seniority text,
  skills text[],
  source_url text,
  posted_at timestamptz,
  created_at timestamptz default now()
);

-- Intelligence briefs (daily AI-generated)
create table intelligence_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null unique,
  content text not null,
  highlights jsonb,
  competitor_mentions jsonb,
  federal_highlights jsonb,
  generated_by text default 'claude',
  created_at timestamptz default now()
);

-- Indexes
create index idx_competitor_intel_competitor on competitor_intel(competitor_id);
create index idx_federal_opportunities_naics on federal_opportunities(naics_code);
create index idx_federal_opportunities_deadline on federal_opportunities(response_deadline);
create index idx_federal_opportunities_score on federal_opportunities(fit_score desc);
create index idx_contract_awards_date on contract_awards(award_date);
create index idx_contract_awards_naics on contract_awards(naics_code);
create index idx_job_postings_competitor on job_postings(competitor_id);
create index idx_intelligence_briefs_date on intelligence_briefs(brief_date desc);
