/**
 * Adaptive sliding-window rate limiter.
 * Starts with a budget of 30 requests per 30 seconds.
 * On 429, pauses all requests for the Retry-After duration.
 */

const WINDOW_MS = 30_000;
const MAX_REQUESTS = 30;

export class RateLimiter {
  private timestamps: number[] = [];
  private pausedUntil = 0;

  /**
   * Wait until it's safe to make a request.
   * Resolves immediately if under budget, otherwise waits.
   */
  async acquire(): Promise<void> {
    // If paused due to 429, wait it out
    const now = Date.now();
    if (now < this.pausedUntil) {
      const waitMs = this.pausedUntil - now;
      await sleep(waitMs);
    }

    // Sliding window: remove timestamps older than WINDOW_MS
    const cutoff = Date.now() - WINDOW_MS;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);

    // If at capacity, wait until the oldest request exits the window
    if (this.timestamps.length >= MAX_REQUESTS) {
      const waitMs = this.timestamps[0] - cutoff + 50; // 50ms buffer
      await sleep(waitMs);
      // Clean up again
      const newCutoff = Date.now() - WINDOW_MS;
      this.timestamps = this.timestamps.filter((t) => t > newCutoff);
    }

    this.timestamps.push(Date.now());
  }

  /**
   * Call this when a 429 response is received.
   * Pauses all requests for the specified duration.
   */
  onRateLimited(retryAfterSeconds: number): void {
    const pauseMs = retryAfterSeconds * 1000;
    this.pausedUntil = Date.now() + pauseMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Singleton rate limiter instance */
export const rateLimiter = new RateLimiter();
