import { NextRequest, NextResponse } from 'next/server';
import { checkDailyBudget, initRunBudget } from '@/lib/utils/budget';
import { emitNotification } from '@/lib/utils/notify';
import {
  checkSourceAvailability,
  resolveDegradationLevel,
  type DegradationMode,
} from '@/lib/utils/degradation';

// --- Degradation modes (ordered FULL → UNAVAILABLE) ---
const ID_DEGRADATION_MODES: DegradationMode[] = [
  {
    level: 'FULL',
    requiredSources: ['claude-api', 'sam-gov', 'usaspending', 'perplexity'],
    optionalSources: [],
    outputNote: null,
    shouldDeliver: true,
  },
  {
    level: 'DEGRADED',
    requiredSources: ['claude-api', 'sam-gov'],
    optionalSources: ['usaspending', 'perplexity'],
    outputNote: 'Some data sources were unavailable. Brief generated with partial data.',
    shouldDeliver: true,
  },
  {
    level: 'MINIMAL',
    requiredSources: ['claude-api'],
    optionalSources: ['sam-gov', 'usaspending', 'perplexity'],
    outputNote: 'Most data sources unavailable. Brief generated from cached data only.',
    shouldDeliver: true,
  },
  {
    level: 'UNAVAILABLE',
    requiredSources: [],
    optionalSources: ['claude-api', 'sam-gov', 'usaspending', 'perplexity'],
    outputNote: 'Claude API unavailable — cannot generate brief.',
    shouldDeliver: false,
  },
];

// Cron endpoint: triggers all collectors + brief generation
// Schedule: biweekly (1st & 15th, configured in vercel.json)
// Secured by CRON_SECRET to prevent unauthorized triggers

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Priority 8 — Budget check at START of cron handler
  const budget = await checkDailyBudget();
  if (budget.exceeded) {
    emitNotification({
      type: 'alert',
      tier: 'critical',
      title: 'Intelligence Dashboard: daily budget exceeded',
      body: `Spent $${budget.spentToday.toFixed(4)} of $${budget.cap.toFixed(2)} daily cap. Cron run skipped.`,
      source_system: 'intelligence-dashboard',
    });
    return NextResponse.json(
      {
        cron: 'collect',
        status: 'budget-exceeded',
        spentToday: budget.spentToday,
        cap: budget.cap,
        timestamp: new Date().toISOString(),
      },
      { status: 429 },
    );
  }

  // Phase 4 — Per-run budget initialization
  const runBudget = initRunBudget();

  // Phase 4 — Degradation check: assess source availability via circuit breakers
  const sourceAvailability = await checkSourceAvailability([
    'claude-api', 'sam-gov', 'usaspending', 'perplexity',
  ]);
  const degradation = resolveDegradationLevel(ID_DEGRADATION_MODES, sourceAvailability);

  console.info(`[cron/collect] Degradation level: ${degradation.level}`, sourceAvailability);

  if (!degradation.shouldDeliver) {
    emitNotification({
      type: 'alert',
      tier: 'critical',
      title: `Intelligence Dashboard: ${degradation.level}`,
      body: degradation.outputNote || 'All critical sources unavailable. Cron run aborted.',
      source_system: 'intelligence-dashboard',
    });
    return NextResponse.json(
      {
        cron: 'collect',
        status: 'unavailable',
        degradation: degradation.level,
        sourceAvailability,
        outputNote: degradation.outputNote,
        runBudget: { id: runBudget.runId, cap: runBudget.cap },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
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

  // Priority 7 — Minimum-data gate: count total new records from all collectors
  const newRecordCount =
    (samResult?.upserted ?? samResult?.fetched ?? 0) +
    (usaResult?.upserted ?? usaResult?.fetched ?? 0) +
    (newsResult?.inserted ?? 0) +
    (jobsResult?.inserted ?? 0);

  if (newRecordCount === 0) {
    console.log('[cron/collect] No new data collected across all phases — skipping brief generation.');
    emitNotification({
      type: 'reminder',
      tier: 'automatic',
      title: 'Intelligence Dashboard: no new data this run',
      source_system: 'intelligence-dashboard',
    });
    return NextResponse.json({
      cron: 'collect',
      schedule: 'biweekly (1st & 15th)',
      timestamp: new Date().toISOString(),
      status: 'no-new-data',
      degradation: degradation.level,
      outputNote: degradation.outputNote,
      brief_generated: false,
      new_records: 0,
      runBudget: { id: runBudget.runId, cap: runBudget.cap },
      phases: {
        data_collection: { sam: results.sam, usaspending: results.usaspending },
        intelligence: { news: results.news, jobs: results.jobs },
        synthesis: { brief: null, skipped: 'no-new-data' },
      },
    });
  }

  // Phase 3: Brief generation (after all data collected)
  const briefResult = await fetchWithTimeout(`${baseUrl}/api/brief/generate`, 'POST', 15000);
  results.brief = briefResult;

  // Priority 3 — Emit success notification with brief
  if (briefResult?.status === 'generated' || briefResult?.brief_date) {
    const oppCount = briefResult?.counts?.opportunities ?? 0;
    const awardCount = briefResult?.counts?.awards ?? 0;
    const intelCount = briefResult?.counts?.competitorIntel ?? 0;
    emitNotification({
      type: 'suggestion',
      tier: 'automatic',
      title: 'Intelligence Brief ready',
      body: `${newRecordCount} new federal opportunities collected. ${oppCount} qualified opportunities, ${awardCount} awards, ${intelCount} competitor intel items analyzed.`,
      source_system: 'intelligence-dashboard',
      action_url: 'https://intelligence-dashboard-phi.vercel.app/brief',
    });
  }

  return NextResponse.json({
    cron: 'collect',
    schedule: 'biweekly (1st & 15th)',
    timestamp: new Date().toISOString(),
    status: 'completed',
    degradation: degradation.level,
    outputNote: degradation.outputNote,
    brief_generated: true,
    new_records: newRecordCount,
    runBudget: { id: runBudget.runId, cap: runBudget.cap },
    phases: {
      data_collection: { sam: results.sam, usaspending: results.usaspending },
      intelligence: { news: results.news, jobs: results.jobs },
      synthesis: { brief: results.brief },
    },
  });
}
