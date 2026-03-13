import { NextResponse } from 'next/server';

// Job Postings Collector
// Status: STRUCTURED — not active
// Purpose: Track competitor hiring patterns as intelligence signals

const COMPETITOR_CAREERS = {
  'Deloitte': 'https://apply.deloitte.com/careers',
  'McKinsey & Company': 'https://www.mckinsey.com/careers',
  'PwC': 'https://www.pwc.com/us/en/careers.html',
  'EY': 'https://www.ey.com/en_us/careers',
  'Accenture': 'https://www.accenture.com/us-en/careers',
  'KPMG': 'https://www.kpmgcareers.com/',
  'BCG': 'https://careers.bcg.com/',
};

// Keywords that signal OD/leadership/change management hiring
const SIGNAL_KEYWORDS = [
  'organizational development',
  'change management',
  'leadership development',
  'organizational design',
  'talent strategy',
  'workforce transformation',
  'culture transformation',
  'executive coaching',
  'human capital',
  'people advisory',
  'organizational effectiveness',
];

export async function GET() {
  return NextResponse.json({
    collector: 'job-postings',
    status: 'inactive',
    description: 'Job posting collector — tracks competitor hiring signals',
    competitors: Object.keys(COMPETITOR_CAREERS),
    signal_keywords: SIGNAL_KEYWORDS,
    note: 'Structure only. Requires job board API access or scraping implementation.',
  });
}

export async function POST() {
  return NextResponse.json({
    status: 'mock',
    message: 'Job posting collector not active. Table structure in place (job_postings).',
    competitors_configured: Object.keys(COMPETITOR_CAREERS).length,
    keywords_tracked: SIGNAL_KEYWORDS.length,
  });
}
