const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 1500;
const DEFAULT_MAX_DELAY_MS = 30_000;

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function isRetryableError(error: any): boolean {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("agent turn failed")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs fn and retries it with exponential backoff (+ jitter) if it
 * throws an error that looks retryable.
 *
 * Keep maxAttempts low. Reducing request volume upstream is preferable
 * to repeatedly retrying requests against rate limits.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt || !isRetryableError(error)) {
        throw error;
      }

      const rawBackoff = baseDelayMs * Math.pow(2, attempt - 1);
      const cappedBackoff = Math.min(rawBackoff, maxDelayMs);

      // +/- up to 20% jitter to avoid synchronized retries.
      const jitter = cappedBackoff * 0.2 * (Math.random() * 2 - 1);

      const backoffMs = Math.round(cappedBackoff + jitter);

      console.warn(
        `[withAgentRetry] attempt ${attempt}/${maxAttempts} failed (${
          (error as Error)?.message
        }), retrying in ${backoffMs}ms`,
      );

      await delay(backoffMs);
    }
  }

  throw lastError;
}
