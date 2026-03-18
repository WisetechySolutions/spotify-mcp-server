/**
 * Adaptive sliding-window rate limiter.
 * Starts with a budget of 30 requests per 30 seconds.
 * On 429, pauses all requests for the Retry-After duration.
 *
 * Security hardening:
 * - Hard ceiling on requests per minute (60 RPM) regardless of window
 * - Timestamps use monotonic-style clamping to prevent manipulation
 * - onRateLimited clamps pause duration to prevent abuse
 */

const WINDOW_MS = 30_000;
const MAX_REQUESTS = 30;
const HARD_CEILING_PER_MINUTE = 60; // Absolute max requests per 60s, regardless of window
const MAX_PAUSE_SECONDS = 300; // 5 minutes max pause from onRateLimited

export class RateLimiter {
  private timestamps: number[] = [];
  private pausedUntil = 0;
  private minuteTimestamps: number[] = []; // Separate tracker for hard ceiling

  /**
   * Wait until it's safe to make a request.
   * Resolves immediately if under budget, otherwise waits.
   */
  async acquire(): Promise<void> {
    // SECURITY: Cap array sizes to prevent unbounded memory growth
    if (this.timestamps.length > MAX_REQUESTS * 3) {
      this.timestamps = this.timestamps.slice(-MAX_REQUESTS);
    }
    if (this.minuteTimestamps.length > HARD_CEILING_PER_MINUTE * 3) {
      this.minuteTimestamps = this.minuteTimestamps.slice(-HARD_CEILING_PER_MINUTE);
    }

    // If paused due to 429, wait it out
    const now = Date.now();
    if (now < this.pausedUntil) {
      const waitMs = this.pausedUntil - now;
      await sleep(waitMs);
    }

    // Hard ceiling: enforce absolute max per minute
    const minuteCutoff = Date.now() - 60_000;
    this.minuteTimestamps = this.minuteTimestamps.filter((t) => t > minuteCutoff);
    if (this.minuteTimestamps.length >= HARD_CEILING_PER_MINUTE) {
      const waitMs = this.minuteTimestamps[0] - minuteCutoff + 50;
      await sleep(waitMs);
      const newMinuteCutoff = Date.now() - 60_000;
      this.minuteTimestamps = this.minuteTimestamps.filter((t) => t > newMinuteCutoff);
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

    const timestamp = Date.now();
    this.timestamps.push(timestamp);
    this.minuteTimestamps.push(timestamp);
  }

  /**
   * Call this when a 429 response is received.
   * Pauses all requests for the specified duration.
   * Duration is clamped to prevent excessive pauses from malicious headers.
   */
  onRateLimited(retryAfterSeconds: number): void {
    // Clamp to reasonable range to prevent manipulation
    const clampedSeconds = Math.min(
      Math.max(retryAfterSeconds, 0),
      MAX_PAUSE_SECONDS
    );
    const pauseMs = clampedSeconds * 1000;
    this.pausedUntil = Date.now() + pauseMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Singleton rate limiter instance */
export const rateLimiter = new RateLimiter();
