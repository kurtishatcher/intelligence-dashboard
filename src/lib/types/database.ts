export interface Competitor {
  id: string;
  name: string;
  description: string | null;
  revenue_billions: number | null;
  employee_count: number | null;
  headquarters: string | null;
  focus_areas: string[] | null;
  od_relevance: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitorIntel {
  id: string;
  competitor_id: string;
  type: 'revenue' | 'pivot' | 'thought_leadership' | 'framework' | 'offering';
  title: string;
  summary: string | null;
  source_url: string | null;
  significance: 'low' | 'medium' | 'high' | 'critical' | null;
  published_at: string | null;
  created_at: string;
}

export interface FederalOpportunity {
  id: string;
  notice_id: string | null;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  naics_code: string | null;
  naics_description: string | null;
  estimated_value: number | null;
  response_deadline: string | null;
  set_aside: string | null;
  type: string | null;
  fit_score: number | null;
  status: 'new' | 'reviewing' | 'pursuing' | 'passed' | 'submitted';
  notes: string | null;
  source_url: string | null;
  posted_at: string | null;
  created_at: string;
}

export interface ContractAward {
  id: string;
  award_id: string | null;
  title: string;
  agency: string | null;
  winner: string | null;
  winner_duns: string | null;
  value: number | null;
  duration_months: number | null;
  naics_code: string | null;
  naics_description: string | null;
  award_date: string | null;
  description: string | null;
  source_url: string | null;
  created_at: string;
}

export interface JobPosting {
  id: string;
  competitor_id: string;
  title: string;
  location: string | null;
  department: string | null;
  seniority: string | null;
  skills: string[] | null;
  source_url: string | null;
  posted_at: string | null;
  created_at: string;
}

export interface IntelligenceBrief {
  id: string;
  brief_date: string;
  content: string;
  highlights: Record<string, unknown>[] | null;
  competitor_mentions: Record<string, unknown> | null;
  federal_highlights: Record<string, unknown> | null;
  generated_by: string;
  created_at: string;
}
