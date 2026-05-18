// stoa/src/retry.ts — Retry with exponential backoff and jitter
import { createLogger } from "./logger.js";

const log = createLogger("retry");

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  backoffFactor: number;
  retryOn?: (error: Error) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(delay: number): number {
  // Add ±25% jitter
  const variance = delay * 0.25;
  return delay + (Math.random() * 2 - 1) * variance;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (opts.retryOn && !opts.retryOn(lastError)) {
        throw lastError;
      }

      if (attempt === opts.maxAttempts) {
        log.error(`${label}: all ${opts.maxAttempts} attempts failed`, {
          error: lastError.message,
        });
        throw lastError;
      }

      const delay = Math.min(
        jitter(opts.baseDelay * Math.pow(opts.backoffFactor, attempt - 1)),
        opts.maxDelay
      );

      log.warn(`${label}: attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${Math.round(delay)}ms`, {
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError!;
}

/** Retry specifically for git push operations */
export async function withGitRetry<T>(fn: () => T, label: string): Promise<T> {
  return withRetry(
    async () => fn(),
    label,
    { maxAttempts: 5, baseDelay: 2000, maxDelay: 15000, backoffFactor: 2 }
  );
}
