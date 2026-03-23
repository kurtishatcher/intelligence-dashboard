// src/lib/utils/budget.ts — S9 Phase 3 Priority 8
// Budget check utility. Queries et_api_costs for today's spend by source_system.
// Returns whether the daily cap has been exceeded.

import { createClient } from '@supabase/supabase-js';

const DAILY_CAP_USD = 0.50;
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
