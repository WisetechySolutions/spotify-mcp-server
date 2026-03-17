import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter } from "../../src/utils/rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("allows requests under budget", async () => {
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50); // Should be near-instant
  });

  it("tracks multiple requests without blocking under budget", async () => {
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("pauses on rate limit", async () => {
    limiter.onRateLimited(1); // Pause for 1 second
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(2000);
  });
});
