import { NextRequest, NextResponse } from 'next/server';
import { generateBrief } from '@/lib/services/brief-generator';

export async function POST(request: NextRequest) {
  // Accept both authenticated session (manual trigger) and CRON_SECRET (cron trigger)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron-triggered — proceed
  } else {
    // Manual trigger — middleware handles auth
  }

  try {
    const result = await generateBrief();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      status: 'generated',
      brief_date: result.brief_date,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
