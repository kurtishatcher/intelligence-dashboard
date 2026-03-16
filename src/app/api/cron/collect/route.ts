import { NextRequest, NextResponse } from 'next/server';

// Cron endpoint: triggers all collectors + brief generation
// Schedule: biweekly (1st & 15th, configured in vercel.json)
// Secured by CRON_SECRET to prevent unauthorized triggers

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = request.nextUrl.origin;
  const results: Record<string, unknown> = {};

  const collectorHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
  };

  async function fetchWithTimeout(url: string, method = 'POST', timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: collectorHeaders, signal: controller.signal });
      return await res.json();
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : String(err);
      return { error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  // Phase 1: Data collection (parallel) — SAM.gov + USAspending
  const [samResult, usaResult] = await Promise.all([
    fetchWithTimeout(`${baseUrl}/api/collectors/sam`),
    fetchWithTimeout(`${baseUrl}/api/collectors/usaspending`),
  ]);
  results.sam = samResult;
  results.usaspending = usaResult;

  // Phase 2: Intelligence collection (parallel) — News + Jobs
  const [newsResult, jobsResult] = await Promise.all([
    fetchWithTimeout(`${baseUrl}/api/collectors/news`, 'POST', 15000),
    fetchWithTimeout(`${baseUrl}/api/collectors/jobs`, 'POST', 15000),
  ]);
  results.news = newsResult;
  results.jobs = jobsResult;

  // Phase 3: Brief generation (after all data collected)
  const briefResult = await fetchWithTimeout(`${baseUrl}/api/brief/generate`, 'POST', 15000);
  results.brief = briefResult;

  return NextResponse.json({
    cron: 'collect',
    schedule: 'biweekly (1st & 15th)',
    timestamp: new Date().toISOString(),
    phases: {
      data_collection: { sam: results.sam, usaspending: results.usaspending },
      intelligence: { news: results.news, jobs: results.jobs },
      synthesis: { brief: results.brief },
    },
  });
}
