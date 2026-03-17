/**
 * API Cost Logger — Portable snippet for all ecosystem apps.
 *
 * SETUP:
 * 1. Copy this file to your app's src/lib/services/cost-logger.ts
 * 2. Update SOURCE_APP to match your app name
 * 3. Ensure your app has createAdminClient() in src/lib/supabase/admin.ts
 *    (all VT50 apps already have this)
 * 4. Wrap your Claude API calls with trackClaudeCall()
 *
 * EXAMPLE (in your claude.ts):
 *
 *   import { trackClaudeCall } from '@/lib/services/cost-logger';
 *
 *   const response = await trackClaudeCall(
 *     'your-app-name',        // source_app
 *     'generate-brief',       // purpose
 *     'claude-sonnet-4-6',    // model
 *     () => client.messages.create({ model, max_tokens, system, messages }),
 *   );
 *
 * The logger is fire-and-forget — it never blocks or throws.
 * Cost data flows to et_api_costs in the shared Supabase instance
 * and appears in the AI ROI Tracker dashboard at:
 *   https://ai-roi-tracker-azure.vercel.app/costs
 *
 * TABLE: et_api_costs (already created in shared Supabase)
 * RLS: authenticated + service_role access
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================
// UPDATE THIS to match your app name
// ============================================================
const SOURCE_APP = 'intelligence-dashboard';
// Valid names: command-center, intelligence-dashboard, knowledge-system,
//   research-pipeline, daily-digest, information-digest, one-center-ecosystem,
//   public-payments, ai-roi-tracker

/**
 * Claude API pricing per million tokens (as of 2026).
 * Update when Anthropic changes pricing.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 5.0, output: 25.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-5': { input: 5.0, output: 25.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
};

const DEFAULT_PRICING = { input: 3.0, output: 15.0 };

export interface ApiCostEntry {
  source_app: string;
  model: string;
  purpose: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

export async function logApiCost(entry: ApiCostEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('et_api_costs').insert(entry);
    if (error) {
      console.error('[CostLogger] Failed to log API cost:', error.message);
    }
  } catch (err) {
    console.error('[CostLogger] Error:', err);
  }
}

/**
 * Wraps a Claude API call — logs cost and returns the response.
 * Fire-and-forget logging, never blocks the response.
 */
export async function trackClaudeCall<T>(
  sourceApp: string,
  purpose: string,
  model: string,
  callFn: () => Promise<T & { usage: { input_tokens: number; output_tokens: number } }>,
): Promise<T & { usage: { input_tokens: number; output_tokens: number } }> {
  const start = Date.now();
  const response = await callFn();
  const durationMs = Date.now() - start;

  const { input_tokens, output_tokens } = response.usage;
  const costUsd = calculateCost(model, input_tokens, output_tokens);

  logApiCost({
    source_app: sourceApp,
    model,
    purpose,
    input_tokens,
    output_tokens,
    cost_usd: costUsd,
    duration_ms: durationMs,
  });

  return response;
}
