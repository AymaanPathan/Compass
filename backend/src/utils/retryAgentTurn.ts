function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: any): boolean {
  const status = err?.status || err?.response?.status;
  const message = String(err?.message || "");
  return status === 429 || message.includes("429");
}

/**
 * Runs an agent turn with retry-on-429 and exponential backoff.
 * fn should perform the full session.createSession + turn.execute + text
 * accumulation, and either return the accumulated text or throw.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 2,
    baseDelayMs = 1200,
  }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === retries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `Agent call rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}
