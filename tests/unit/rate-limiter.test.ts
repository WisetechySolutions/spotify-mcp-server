import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { RateLimiter } from "../../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under budget immediately", async () => {
    const promise = limiter.acquire();
    await vi.runAllTimersAsync();
    await promise;
    // No error = passed
  });

  it("tracks multiple requests without blocking under budget", async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(limiter.acquire());
    }
    await vi.runAllTimersAsync();
    await Promise.all(promises);
  });

  it("pauses on rate limit", async () => {
    limiter.onRateLimited(5); // Pause for 5 seconds

    let acquired = false;
    const promise = limiter.acquire().then(() => {
      acquired = true;
    });

    // After 4 seconds, still paused
    await vi.advanceTimersByTimeAsync(4000);
    expect(acquired).toBe(false);

    // After 5+ seconds, should resolve
    await vi.advanceTimersByTimeAsync(1500);
    await promise;
    expect(acquired).toBe(true);
  });

  it("handles zero-second pause", async () => {
    limiter.onRateLimited(0);
    const promise = limiter.acquire();
    await vi.runAllTimersAsync();
    await promise;
  });

  it("latest onRateLimited call wins", async () => {
    limiter.onRateLimited(10);
    limiter.onRateLimited(2); // Override with shorter pause

    let acquired = false;
    const promise = limiter.acquire().then(() => {
      acquired = true;
    });

    await vi.advanceTimersByTimeAsync(2500);
    await promise;
    expect(acquired).toBe(true);
  });
});
