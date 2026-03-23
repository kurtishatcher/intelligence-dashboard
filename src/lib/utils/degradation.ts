// src/lib/utils/degradation.ts — S9 Phase 4 Pattern 2
// Degradation utility: checks source availability via circuit breakers
// and resolves the appropriate operating mode for the cron pipeline.

import { checkCircuit } from './circuit-breaker';

export type DegradationLevel = 'FULL' | 'DEGRADED' | 'MINIMAL' | 'UNAVAILABLE';

export interface DegradationMode {
  level: DegradationLevel;
  requiredSources: string[];
  optionalSources: string[];
  outputNote: string | null;
  shouldDeliver: boolean;
}

/**
 * Check circuit breaker state for each dependency in parallel.
 * Returns a map of dependency → available (true/false).
 * Fails open: if the check itself errors, marks the source as available.
 */
export async function checkSourceAvailability(
  dependencies: string[],
): Promise<Record<string, boolean>> {
  const results = await Promise.allSettled(
    dependencies.map(async (dep) => {
      const allowed = await checkCircuit(dep);
      return { dep, allowed };
    }),
  );

  const availability: Record<string, boolean> = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      availability[result.value.dep] = result.value.allowed;
    } else {
      // Fail open — treat errored checks as available
      const dep = dependencies[results.indexOf(result)];
      availability[dep] = true;
    }
  }

  return availability;
}

/**
 * Walk the ordered list of degradation modes and return the first where
 * all required sources are available. Falls through to the last mode
 * (UNAVAILABLE) if nothing matches.
 */
export function resolveDegradationLevel(
  modes: DegradationMode[],
  availability: Record<string, boolean>,
): DegradationMode {
  for (const mode of modes) {
    const allRequiredAvailable = mode.requiredSources.every(
      (src) => availability[src] !== false,
    );
    if (allRequiredAvailable) return mode;
  }

  // Fallback — should never reach here if modes includes UNAVAILABLE with no requirements
  return modes[modes.length - 1];
}
