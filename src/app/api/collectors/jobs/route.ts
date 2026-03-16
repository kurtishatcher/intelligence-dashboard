import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const COMPETITORS = [
  'Deloitte', 'McKinsey & Company', 'PwC', 'EY', 'Accenture', 'KPMG', 'BCG',
];

const SIGNAL_KEYWORDS = [
  'organizational development', 'change management', 'leadership development',
  'organizational design', 'talent strategy', 'workforce transformation',
  'culture transformation', 'executive coaching', 'human capital',
  'people advisory', 'organizational effectiveness',
];

interface PerplexityResult {
  competitor: string;
  content: string;
}

export async function GET() {
  return NextResponse.json({
    collector: 'job-postings',
    status: 'active',
    competitors: COMPETITORS,
    signal_keywords: SIGNAL_KEYWORDS,
    requires: 'PERPLEXITY_API_KEY',
  });
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityKey) {
    return NextResponse.json({
      collector: 'job-postings',
      status: 'skipped',
      message: 'PERPLEXITY_API_KEY not configured. Add it to environment variables to enable job collection.',
    });
  }

  const supabase = createAdminClient();

  // Resolve competitor names → ids
  const { data: competitors } = await supabase.from('competitors').select('id, name');
  const competitorMap = new Map<string, string>();
  (competitors || []).forEach(c => competitorMap.set(c.name, c.id));

  // Search for jobs using Perplexity (max 3 concurrent to avoid rate limits)
  const results: PerplexityResult[] = [];
  const errors: string[] = [];

  // Process in batches of 3
  for (let i = 0; i < COMPETITORS.length; i += 3) {
    const batch = COMPETITORS.slice(i, i + 3);
    await Promise.allSettled(
      batch.map(async (competitor) => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${perplexityKey}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'sonar',
              messages: [{
                role: 'user',
                content: `List current job openings at ${competitor} related to organizational development, change management, leadership development, human capital, or workforce transformation. For each job, provide the title, location, and department. Only include jobs posted in the last 30 days if possible.`,
              }],
              max_tokens: 1000,
            }),
          });
          clearTimeout(timer);

          if (!res.ok) {
            errors.push(`${competitor}: Perplexity HTTP ${res.status}`);
            return;
          }
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || '';
          if (content) {
            results.push({ competitor, content });
          }
        } catch (err) {
          errors.push(`${competitor}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );
  }

  if (results.length === 0) {
    return NextResponse.json({
      collector: 'job-postings',
      status: 'completed',
      searched: COMPETITORS.length,
      results: 0,
      inserted: 0,
      errors,
    });
  }

  // Extract structured job data with Claude Haiku
  const anthropic = new Anthropic();
  const combinedResults = results.map(r => `## ${r.competitor}\n${r.content}`).join('\n\n');

  let jobs: { competitor: string; title: string; location: string; department: string; seniority: string; skills: string[] }[] = [];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `Extract structured job posting data from the search results. Return a JSON array where each object has:
- competitor: company name (exactly as provided)
- title: job title
- location: city/state or "Remote"
- department: department or practice area
- seniority: one of "entry", "mid", "senior", "executive"
- skills: array of 2-5 relevant skill keywords

Only include jobs clearly related to OD, change management, leadership, human capital, or workforce transformation. Return ONLY the JSON array.`,
      messages: [{
        role: 'user',
        content: `Extract job postings from these search results:\n\n${combinedResults}`,
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    jobs = JSON.parse(cleaned);
  } catch (err) {
    return NextResponse.json({
      collector: 'job-postings',
      status: 'error',
      searched: COMPETITORS.length,
      error: `Classification failed: ${err}`,
      errors,
    });
  }

  // Dedup and insert
  let inserted = 0;
  for (const job of jobs) {
    const competitorId = competitorMap.get(job.competitor);
    if (!competitorId) continue;

    // Check for existing posting with same title + competitor
    const { data: existing } = await supabase
      .from('job_postings')
      .select('id')
      .eq('competitor_id', competitorId)
      .eq('title', job.title)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from('job_postings').insert({
      competitor_id: competitorId,
      title: job.title,
      location: job.location,
      department: job.department,
      seniority: job.seniority,
      skills: job.skills,
      posted_at: new Date().toISOString(),
    });

    if (!error) inserted++;
  }

  return NextResponse.json({
    collector: 'job-postings',
    status: 'completed',
    searched: COMPETITORS.length,
    results_found: results.length,
    jobs_extracted: jobs.length,
    inserted,
    errors,
  });
}
