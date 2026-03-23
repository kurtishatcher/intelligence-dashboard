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

export interface RunBudget {
  runId: string;
  cap: number;
  spent: number;
  exceeded: boolean;
  remaining: number;
}

// Module-level state for the current run
let currentRunId: string | null = null;
let currentRunSpent = 0;

/**
 * Initialize per-run budget tracking. Call at the start of each cron execution.
 * Returns the run ID for reference.
 */
export function initRunBudget(): RunBudget {
  currentRunId = `run-${Date.now()}`;
  currentRunSpent = 0;
  console.info(`[budget] Per-run budget initialized: ${currentRunId}, cap=$${PER_RUN_CAP_USD}`);
  return {
    runId: currentRunId,
    cap: PER_RUN_CAP_USD,
    spent: 0,
    exceeded: false,
    remaining: PER_RUN_CAP_USD,
  };
}

/**
 * Record spend against the current run budget.
 * Returns updated budget state. If no run is active, silently returns a default.
 */
export function recordRunSpend(amountUsd: number): RunBudget {
  if (!currentRunId) {
    // No active run — initialize one to be safe
    initRunBudget();
  }

  currentRunSpent += amountUsd;
  const exceeded = currentRunSpent >= PER_RUN_CAP_USD;
  const remaining = Math.max(0, PER_RUN_CAP_USD - currentRunSpent);

  if (exceeded) {
    console.warn(`[budget] Per-run cap exceeded: $${currentRunSpent.toFixed(4)} of $${PER_RUN_CAP_USD} (run: ${currentRunId})`);
  }

  return {
    runId: currentRunId!,
    cap: PER_RUN_CAP_USD,
    spent: Math.round(currentRunSpent * 1_000_000) / 1_000_000,
    exceeded,
    remaining: Math.round(remaining * 1_000_000) / 1_000_000,
  };
}

/**
 * Check current run budget without recording spend.
 */
export function checkRunBudget(): RunBudget {
  const remaining = Math.max(0, PER_RUN_CAP_USD - currentRunSpent);
  return {
    runId: currentRunId || 'no-active-run',
    cap: PER_RUN_CAP_USD,
    spent: Math.round(currentRunSpent * 1_000_000) / 1_000_000,
    exceeded: currentRunSpent >= PER_RUN_CAP_USD,
    remaining: Math.round(remaining * 1_000_000) / 1_000_000,
  };
}
