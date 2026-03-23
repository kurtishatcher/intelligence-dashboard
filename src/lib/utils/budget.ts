// src/lib/utils/budget.ts — S9 Phase 3 Priority 8 + Phase 4 per-run budget
// Budget check utility. Queries et_api_costs for today's spend by source_system.
// Returns whether the daily cap has been exceeded.
// Also provides per-run budget tracking ($0.15 cap per cron execution).

import { createClient } from '@supabase/supabase-js';

const DAILY_CAP_USD = 0.50;
const PER_RUN_CAP_USD = 0.15;
const SOURCE_SYSTEM = 'intelligence-dashboard';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export interface BudgetCheckResult {
  exceeded: boolean;
  spentToday: number;
  cap: number;
  remaining: number;
}

export async function checkDailyBudget(): Promise<BudgetCheckResult> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('et_api_costs')
      .select('cost_usd')
      .eq('source_app', SOURCE_SYSTEM)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      console.error('[budget] Query failed:', error.message);
      // On query failure, allow the operation to proceed (fail-open)
      return { exceeded: false, spentToday: 0, cap: DAILY_CAP_USD, remaining: DAILY_CAP_USD };
    }

    const spentToday = (data || []).reduce((sum, row) => sum + (row.cost_usd || 0), 0);
    const remaining = Math.max(0, DAILY_CAP_USD - spentToday);

    return {
      exceeded: spentToday >= DAILY_CAP_USD,
      spentToday: Math.round(spentToday * 1_000_000) / 1_000_000,
      cap: DAILY_CAP_USD,
      remaining: Math.round(remaining * 1_000_000) / 1_000_000,
    };
  } catch (err) {
    console.error('[budget] checkDailyBudget failed:', err);
    // Fail-open
    return { exceeded: false, spentToday: 0, cap: DAILY_CAP_USD, remaining: DAILY_CAP_USD };
  }
}

// --- Per-run budget tracking ---
// Uses a Map keyed by runId so concurrent invocations are isolated.

export interface RunBudget {
  runId: string;
  cap: number;
  spent: number;
  exceeded: boolean;
  remaining: number;
}

const runBudgets = new Map<string, { cap: number; spent: number }>();

/**
 * Initialize per-run budget tracking. Call at the start of each cron execution.
 * Returns the RunBudget (including the generated runId) for the caller to pass
 * into recordRunSpend / checkRunBudget.
 */
export function initRunBudget(): RunBudget {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  runBudgets.set(runId, { cap: PER_RUN_CAP_USD, spent: 0 });
  console.info(`[budget] Per-run budget initialized: ${runId}, cap=$${PER_RUN_CAP_USD}`);
  return {
    runId,
    cap: PER_RUN_CAP_USD,
    spent: 0,
    exceeded: false,
    remaining: PER_RUN_CAP_USD,
  };
}

/**
 * Record spend against a specific run's budget.
 * Pass the runId from the RunBudget returned by initRunBudget().
 * Falls back to creating a new run if runId is unknown (backward compat).
 */
export function recordRunSpend(amountUsd: number, runId?: string): RunBudget {
  // If no runId provided or not found, initialize a new one for backward compat
  if (!runId || !runBudgets.has(runId)) {
    const fallback = initRunBudget();
    runId = fallback.runId;
  }

  const budget = runBudgets.get(runId)!;
  budget.spent += amountUsd;
  const exceeded = budget.spent >= budget.cap;
  const remaining = Math.max(0, budget.cap - budget.spent);

  if (exceeded) {
    console.warn(`[budget] Per-run cap exceeded: $${budget.spent.toFixed(4)} of $${budget.cap} (run: ${runId})`);
  }

  return {
    runId,
    cap: budget.cap,
    spent: Math.round(budget.spent * 1_000_000) / 1_000_000,
    exceeded,
    remaining: Math.round(remaining * 1_000_000) / 1_000_000,
  };
}

/**
 * Check current run budget without recording spend.
 * Pass the runId from the RunBudget returned by initRunBudget().
 */
export function checkRunBudget(runId?: string): RunBudget {
  if (runId && runBudgets.has(runId)) {
    const budget = runBudgets.get(runId)!;
    const remaining = Math.max(0, budget.cap - budget.spent);
    return {
      runId,
      cap: budget.cap,
      spent: Math.round(budget.spent * 1_000_000) / 1_000_000,
      exceeded: budget.spent >= budget.cap,
      remaining: Math.round(remaining * 1_000_000) / 1_000_000,
    };
  }
  return {
    runId: runId || 'no-active-run',
    cap: PER_RUN_CAP_USD,
    spent: 0,
    exceeded: false,
    remaining: PER_RUN_CAP_USD,
  };
}

/**
 * Clean up a run's budget (call at end of pipeline).
 */
export function clearRunBudget(runId: string): void {
  runBudgets.delete(runId);
}
