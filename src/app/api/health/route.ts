/**
 * GET /api/health
 * Skill: health-reporting (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/cross-cutting/health-reporting.skill.md
 *
 * Public endpoint — no auth required.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SYSTEM = 'intelligence-dashboard';
const VERSION = '0.1.0';

type Check = { name: string; status: 'pass' | 'fail'; latency_ms?: number; note?: string };

export async function GET() {
  const checks: Check[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Required: Supabase connectivity
  const dbStart = Date.now();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('competitors').select('id', { count: 'exact', head: true });
    if (error) throw error;
    checks.push({ name: 'supabase', status: 'pass', latency_ms: Date.now() - dbStart });
  } catch {
    checks.push({ name: 'supabase', status: 'fail', latency_ms: Date.now() - dbStart });
    overallStatus = 'unhealthy';
  }

  // Required: ANTHROPIC_API_KEY
  if (process.env.ANTHROPIC_API_KEY) {
    checks.push({ name: 'anthropic_key', status: 'pass' });
  } else {
    checks.push({ name: 'anthropic_key', status: 'fail', note: 'ANTHROPIC_API_KEY not set' });
    overallStatus = 'unhealthy';
  }

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      system: SYSTEM,
      version: VERSION,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: httpStatus }
  );
}
