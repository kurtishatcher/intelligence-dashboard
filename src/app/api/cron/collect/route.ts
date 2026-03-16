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

  // SAM.gov collector — requires SAM_GOV_API_KEY env var
  const samResult = await fetch(`${baseUrl}/api/collectors/sam`, { method: 'POST' }).then((r) => r.json()).catch((err) => ({ error: String(err) }));
  results.sam = samResult;

  // USAspending collector — active (public API, no key needed)
  const usaResult = await fetch(`${baseUrl}/api/collectors/usaspending`, { method: 'POST' }).then((r) => r.json()).catch((err) => ({ error: String(err) }));
  results.usaspending = usaResult;

  return NextResponse.json({
    cron: 'collect',
    schedule: 'every 2 weeks',
    timestamp: new Date().toISOString(),
    results,
  });
}
