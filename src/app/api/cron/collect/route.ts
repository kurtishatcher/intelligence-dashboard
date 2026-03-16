import { NextRequest, NextResponse } from 'next/server';

// Cron endpoint: triggers SAM.gov + USAspending collectors
// Schedule: every 2 weeks (configured in vercel.json)
// Secured by CRON_SECRET to prevent unauthorized triggers

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
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

  async function fetchWithTimeout(url: string, timeoutMs = 55000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', headers: collectorHeaders, signal: controller.signal });
      return await res.json();
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : String(err);
      return { error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  // Run both collectors in parallel with timeouts
  const [samResult, usaResult] = await Promise.all([
    fetchWithTimeout(`${baseUrl}/api/collectors/sam`),
    fetchWithTimeout(`${baseUrl}/api/collectors/usaspending`),
  ]);
  results.sam = samResult;
  results.usaspending = usaResult;

  return NextResponse.json({
    cron: 'collect',
    schedule: 'every 2 weeks',
    timestamp: new Date().toISOString(),
    results,
  });
}
