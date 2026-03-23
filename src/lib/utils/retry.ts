// src/lib/utils/retry.ts — S9 Phase 3 Priority 1
// Shared retry utility with exponential backoff

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  retryOn: readonly number[];
}

export const RETRY_CONFIGS = {
  claude: { maxAttempts: 3, baseDelayMs: 1000, retryOn: [429, 529] },
  openai: { maxAttempts: 3, baseDelayMs: 1000, retryOn: [429, 500] },
  perplexity: { maxAttempts: 2, baseDelayMs: 2000, retryOn: [429, 500] },
  samgov: { maxAttempts: 3, baseDelayMs: 2000, retryOn: [429, 500, 503] },
} as const;

/**
 * Wraps an async function with exponential backoff retry logic.
 * Retries only on specified HTTP status codes.
 * On final failure, throws the original error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context: string
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const status = (error as { status?: number }).status;

      if (!status || !config.retryOn.includes(status)) {
        console.error(`[${context}] Non-retryable error (status ${status ?? 'unknown'}):`, lastError.message);
        throw lastError;
      }

      if (attempt === config.maxAttempts) {
        console.error(`[${context}] All ${config.maxAttempts} attempts exhausted. Last error:`, lastError.message);
        break;
      }

      const delay = config.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
      console.warn(`[${context}] Attempt ${attempt} failed (status ${status}). Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
