/**
 * Skill: Cost Tracking (v1.0.0)
 * Spec: 000_Fleet_Maturity/007_Skills/cross-cutting/cost-tracking.skill.md
 *
 * Single authoritative implementation for logging AI API costs to the shared
 * et_api_costs table. Replaces per-system cost-logger.ts copies.
 *
 * Fire-and-forget — never throws, never blocks the parent operation.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================
// System identity — update per repo
// ============================================================
const SYSTEM_NAME = 'intelligence-dashboard';

/**
 * Model pricing per million tokens (USD).
 * Source: Anthropic, Voyage AI, Perplexity pricing pages.
 * Last verified: 2026-03-21.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':            { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':          { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':           { input: 0.80,  output: 4.00  },
  'claude-haiku-4-5-20251001':  { input: 0.80,  output: 4.00  },
  'claude-opus-4-5':            { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5':          { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku-20241022':  { input: 0.80,  output: 4.00  },
  'text-embedding-3-small':     { input: 0.02,  output: 0     },
  'llama-sonar-small-online':   { input: 0.20,  output: 0.20  },
  'llama-sonar-large-online':   { input: 1.00,  output: 1.00  },
};

// --- Public API (matches skill spec interface) ---

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0; // Unknown model → $0, flagged via metadata
  const cost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Log an API cost record. Maps skill spec field names to existing DB columns:
 *   spec.systemName  → DB.source_app
 *   spec.operation    → DB.purpose
 *   spec.metadata     → DB.metadata (jsonb, added via migration)
 */
export async function logCost(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  operation: string;
  systemName?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const costUsd = calculateCost(params.model, params.inputTokens, params.outputTokens);
  const isUnknownModel = !MODEL_PRICING[params.model];

  try {
    const supabase = createAdminClient();
    await supabase.from('et_api_costs').insert({
      source_app: params.systemName ?? SYSTEM_NAME,
      model: params.model,
      purpose: params.operation,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: costUsd,
      duration_ms: params.durationMs ?? 0,
      metadata: {
        ...(params.metadata ?? {}),
        ...(isUnknownModel ? { pricing_unknown: true } : {}),
      },
    });
  } catch (err) {
    console.error('[cost-tracking] Failed to log cost:', err);
  }
}

// --- Backward-compatible wrapper (matches existing trackClaudeCall signature) ---

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

  logCost({
    model,
    inputTokens: input_tokens,
    outputTokens: output_tokens,
    operation: purpose,
    systemName: sourceApp,
    durationMs,
  });

  return response;
}

// --- Batch logging for pipeline runs ---

export async function logCostBatch(
  entries: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    operation: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  const rows = entries.map((e) => {
    const costUsd = calculateCost(e.model, e.inputTokens, e.outputTokens);
    const isUnknownModel = !MODEL_PRICING[e.model];
    return {
      source_app: SYSTEM_NAME,
      model: e.model,
      purpose: e.operation,
      input_tokens: e.inputTokens,
      output_tokens: e.outputTokens,
      cost_usd: costUsd,
      duration_ms: e.durationMs ?? 0,
      metadata: {
        ...(e.metadata ?? {}),
        ...(isUnknownModel ? { pricing_unknown: true } : {}),
      },
    };
  });

  try {
    const supabase = createAdminClient();
    await supabase.from('et_api_costs').insert(rows);
  } catch (err) {
    console.error('[cost-tracking] Failed to batch log costs:', err);
  }
}

// --- Legacy re-exports for drop-in compatibility ---

export type ApiCostEntry = {
  source_app: string;
  model: string;
  purpose: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
};

export async function logApiCost(entry: ApiCostEntry): Promise<void> {
  return logCost({
    model: entry.model,
    inputTokens: entry.input_tokens,
    outputTokens: entry.output_tokens,
    operation: entry.purpose,
    systemName: entry.source_app,
    durationMs: entry.duration_ms,
  });
}
