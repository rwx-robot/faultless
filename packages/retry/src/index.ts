/**
 * Retry strategies with configurable backoff policies for resilient operations.
 */

export type BackoffStrategy = 'fixed' | 'exponential' | 'exponential-jitter';

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  delay: number;
  /** Maximum delay in milliseconds (for exponential backoff) */
  maxDelay?: number;
  /** Backoff strategy to use */
  backoff?: BackoffStrategy;
  /** Optional function to determine if an error should trigger a retry */
  retryOn?: (error: Error) => boolean;
}

export interface RetryState {
  /** Current attempt number (0-based) */
  attempt: number;
  /** Number of retries performed */
  retries: number;
  /** Total elapsed time in milliseconds */
  elapsedTime: number;
  /** Last error if any */
  lastError?: Error;
}

/**
 * Custom error class for retry failures.
 * Contains information about the retry attempts and the last error.
 */
export class RetryError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Calculates delay for a given attempt using fixed backoff strategy.
 * @param _attempt - Current attempt number (unused for fixed)
 * @param baseDelay - Base delay in milliseconds
 * @returns Delay in milliseconds
 */
function fixedDelay(_attempt: number, baseDelay: number): number {
  return baseDelay;
}

/**
 * Calculates delay for a given attempt using exponential backoff strategy.
 * @param attempt - Current attempt number
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
function exponentialDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Calculates delay for a given attempt using exponential backoff with jitter.
 * Adds random jitter to prevent thundering herd problem.
 * @param attempt - Current attempt number
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds with jitter
 */
function exponentialDelayWithJitter(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay;
  const delay = exponentialDelay + jitter;
  return Math.min(delay, maxDelay);
}

/**
 * Calculates delay based on the selected backoff strategy.
 * @param attempt - Current attempt number
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const baseDelay = options.delay;
  const maxDelay = options.maxDelay ?? baseDelay * 10;

  switch (options.backoff) {
    case 'exponential':
      return exponentialDelay(attempt, baseDelay, maxDelay);
    case 'exponential-jitter':
      return exponentialDelayWithJitter(attempt, baseDelay, maxDelay);
    case 'fixed':
    default:
      return fixedDelay(attempt, baseDelay);
  }
}

/**
 * RetryPolicy class for executing operations with configurable retry logic.
 * Supports multiple backoff strategies and error filtering.
 */
export class RetryPolicy {
  private readonly options: Required<RetryOptions>;

  constructor(options: RetryOptions) {
    if (options.maxAttempts <= 0) {
      throw new Error('maxAttempts must be positive');
    }
    if (options.delay < 0) {
      throw new Error('delay must be non-negative');
    }

    this.options = {
      maxAttempts: options.maxAttempts,
      delay: options.delay,
      maxDelay: options.maxDelay ?? options.delay * 10,
      backoff: options.backoff ?? 'fixed',
      retryOn: options.retryOn ?? (() => true),
    };
  }

  /**
   * Execute a function with retry logic.
   * @param fn - Function to execute (can be sync or async)
   * @returns Promise resolving to the function result
   * @throws RetryError if all attempts fail
   */
  async execute<T>(fn: () => T | Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    const startTime = Date.now();

    for (let attempt = 0; attempt < this.options.maxAttempts; attempt++) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry this error
        if (!this.options.retryOn(lastError)) {
          throw lastError;
        }

        // If this was the last attempt, throw RetryError
        if (attempt === this.options.maxAttempts - 1) {
          throw new RetryError(
            `Failed after ${this.options.maxAttempts} attempts`,
            this.options.maxAttempts,
            lastError
          );
        }

        // Calculate and wait for the delay
        const delay = calculateDelay(attempt, this.options);
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new RetryError(
      `Failed after ${this.options.maxAttempts} attempts`,
      this.options.maxAttempts,
      lastError!
    );
  }

  /**
   * Get the current retry options.
   */
  getOptions(): Readonly<Required<RetryOptions>> {
    return { ...this.options };
  }

  /**
   * Sleep for a specified duration.
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Execute a function with retry logic using the provided options.
 * Convenience function that creates a RetryPolicy and executes the function.
 * @param fn - Function to execute (can be sync or async)
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 * @throws RetryError if all attempts fail
 */
export async function retry<T>(
  fn: () => T | Promise<T>,
  options: RetryOptions
): Promise<T> {
  const policy = new RetryPolicy(options);
  return policy.execute(fn);
}

export {
  fixedDelay,
  exponentialDelay,
  exponentialDelayWithJitter,
  calculateDelay,
};
