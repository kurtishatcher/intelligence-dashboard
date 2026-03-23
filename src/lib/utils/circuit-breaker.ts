// src/lib/utils/circuit-breaker.ts — S9 Phase 4 Pattern 1
// Fleet-wide circuit breaker backed by Supabase s9_circuit_breakers table

import { createClient } from '@supabase/supabase-js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerRecord {
  dependency_id: string;
  state: CircuitState;
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
  cooldown_minutes: number;
  failure_threshold: number;
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Check if a dependency's circuit allows calls.
 * Returns true if CLOSED or HALF_OPEN (probe allowed).
 * Returns false if OPEN and cooldown not elapsed.
 * Fails open — if check errors, allows the call.
 */
export async function checkCircuit(dependencyId: string): Promise<boolean> {
  try {
    const supabase = getAdminClient();
    const { data: cb } = await supabase
      .from('s9_circuit_breakers')
      .select('*')
      .eq('dependency_id', dependencyId)
      .single() as { data: CircuitBreakerRecord | null };

    if (!cb) return true;

    if (cb.state === 'CLOSED') return true;

    if (cb.state === 'OPEN') {
      const openedAt = cb.opened_at ? new Date(cb.opened_at) : null;
      if (!openedAt) return false;

      const cooldownMs = cb.cooldown_minutes * 60 * 1000;
      const elapsed = Date.now() - openedAt.getTime();

      if (elapsed >= cooldownMs) {
        await supabase
          .from('s9_circuit_breakers')
          .update({ state: 'HALF_OPEN', updated_at: new Date().toISOString() })
          .eq('dependency_id', dependencyId);
        console.warn(`[circuit-breaker] ${dependencyId}: OPEN → HALF_OPEN (probing)`);
        return true;
      }

      console.warn(`[circuit-breaker] ${dependencyId}: OPEN — rejecting (${Math.round((cooldownMs - elapsed) / 1000)}s remaining)`);
      return false;
    }

    // HALF_OPEN — allow probe
    return true;
  } catch (err) {
    console.error('[circuit-breaker] State check failed — failing open:', err);
    return true;
  }
}

/**
 * Record a successful call. Resets HALF_OPEN → CLOSED.
 */
export async function recordSuccess(dependencyId: string): Promise<void> {
  try {
    const supabase = getAdminClient();
    const { data: cb } = await supabase
      .from('s9_circuit_breakers')
      .select('state')
      .eq('dependency_id', dependencyId)
      .single() as { data: Pick<CircuitBreakerRecord, 'state'> | null };

    if (!cb) return;

    if (cb.state === 'HALF_OPEN') {
      await supabase
        .from('s9_circuit_breakers')
        .update({
          state: 'CLOSED',
          failure_count: 0,
          success_count: 1,
          opened_at: null,
          last_success_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('dependency_id', dependencyId);
      console.info(`[circuit-breaker] ${dependencyId}: HALF_OPEN → CLOSED (recovered)`);
    } else {
      await supabase.rpc('increment_cb_success', { dep_id: dependencyId });
    }
  } catch (err) {
    console.error('[circuit-breaker] recordSuccess failed:', err);
  }
}

/**
 * Record a failed call. Trips OPEN if threshold reached.
 */
export async function recordFailure(dependencyId: string): Promise<void> {
  try {
    const supabase = getAdminClient();
    const { data: cb } = await supabase
      .from('s9_circuit_breakers')
      .select('*')
      .eq('dependency_id', dependencyId)
      .single() as { data: CircuitBreakerRecord | null };

    if (!cb) return;

    const newFailureCount = cb.failure_count + 1;
    const shouldTrip = newFailureCount >= cb.failure_threshold;

    await supabase
      .from('s9_circuit_breakers')
      .update({
        state: shouldTrip ? 'OPEN' : cb.state,
        failure_count: newFailureCount,
        last_failure_at: new Date().toISOString(),
        opened_at: shouldTrip ? new Date().toISOString() : cb.opened_at,
        updated_at: new Date().toISOString(),
      })
      .eq('dependency_id', dependencyId);

    if (shouldTrip) {
      console.error(`[circuit-breaker] ${dependencyId}: tripped OPEN after ${newFailureCount} failures`);
      // Import dynamically to avoid circular deps in systems without notify.ts
      try {
        const { emitNotification } = await import('./notify');
        await emitNotification({
          type: 'alert',
          tier: 'suggested',
          title: `Circuit breaker OPEN: ${dependencyId}`,
          body: `${newFailureCount} consecutive failures. All systems will reject calls for ${cb.cooldown_minutes} minutes.`,
          source_system: 'circuit-breaker',
        });
      } catch {
        // notify.ts may not exist in all systems (e.g., OCE)
      }
    }
  } catch (err) {
    console.error('[circuit-breaker] recordFailure failed:', err);
  }
}
