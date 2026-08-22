const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 800;

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
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
 * Runs `fn` and retries it with exponential backoff if it throws an
 * error that looks retryable (rate limits, timeouts, transient
 * connection errors, or an explicit agent-turn failure). Non-retryable
 * errors are rethrown immediately.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

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

      const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
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
