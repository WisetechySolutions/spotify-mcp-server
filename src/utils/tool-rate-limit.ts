/**
 * Server-side per-tool rate limiter.
 *
 * Defense against runaway model loops: if a tool ends up in a tight retry
 * cycle (model calls it 1000× while reasoning), the server protects both the
 * upstream API and the user's chat experience by rejecting calls past a
 * sensible threshold with a clear error message.
 *
 * Token bucket: each tool name gets its own bucket. Buckets refill at a steady
 * rate up to a capacity. When empty, calls are rejected immediately.
 *
 * Why per-tool not per-server: a destructive tool (delete_*) deserves a
 * tighter cap than a read tool (list_*). Per-tool also means one runaway
 * tool doesn't starve another.
 *
 * Defaults match the OWASP-style "LLM Top 10 for Agent Tools" mitigation
 * for LLM04 (Model DoS via tool abuse).
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface ToolLimit {
  capacity: number;
  refillPerMs: number; // tokens per millisecond
}

const DEFAULT_LIMIT: ToolLimit = {
  capacity: 60,                  // 60-call burst
  refillPerMs: 1 / 1000,         // 1 token/sec → 60/min steady state
};

const DESTRUCTIVE_LIMIT: ToolLimit = {
  capacity: 10,                  // 10 destructive ops max in a burst
  refillPerMs: 1 / 6000,         // 1 token / 6s → 10/min steady
};

const buckets = new Map<string, Bucket>();
const limits = new Map<string, ToolLimit>();

function take(name: string, now: number): { ok: true } | { ok: false; waitMs: number } {
  const limit = limits.get(name) ?? DEFAULT_LIMIT;
  let b = buckets.get(name);
  if (!b) {
    b = { tokens: limit.capacity, lastRefill: now };
    buckets.set(name, b);
  }
  const elapsed = Math.max(0, now - b.lastRefill);
  b.tokens = Math.min(limit.capacity, b.tokens + elapsed * limit.refillPerMs);
  b.lastRefill = now;
  if (b.tokens < 1) {
    const waitMs = Math.ceil((1 - b.tokens) / limit.refillPerMs);
    return { ok: false, waitMs };
  }
  b.tokens -= 1;
  return { ok: true };
}

interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [k: string]: unknown;
}

type ToolHandler<P> = (params: P) => Promise<McpToolResult> | McpToolResult;

/**
 * Configure a non-default limit for a specific tool. Call before any tool
 * executes (typically in registry setup). Common pattern: tighten destructive
 * tools, loosen pure-read tools.
 */
export function setToolLimit(name: string, limit: Partial<ToolLimit>): void {
  const merged: ToolLimit = { ...DEFAULT_LIMIT, ...limit };
  limits.set(name, merged);
}

/**
 * Mark a tool as destructive — applies the tighter DESTRUCTIVE_LIMIT.
 * Convenience for the common case.
 */
export function markDestructive(name: string): void {
  limits.set(name, DESTRUCTIVE_LIMIT);
}

/**
 * Wrap a tool handler with the per-tool rate limiter. Use at registration:
 *   server.tool("delete_x", desc, schema, withToolRateLimit("delete_x", handler));
 */
export function withToolRateLimit<P>(name: string, handler: ToolHandler<P>): ToolHandler<P> {
  return async (params: P): Promise<McpToolResult> => {
    const result = take(name, Date.now());
    if (!result.ok) {
      const seconds = Math.ceil(result.waitMs / 1000);
      return {
        isError: true,
        content: [{
          type: "text",
          text:
            `Rate limit exceeded for tool ${name}. ` +
            `Try again in about ${seconds}s. ` +
            `(This server caps each tool to a sensible per-minute rate to protect against runaway loops.)`,
        }],
      };
    }
    return handler(params);
  };
}

/** Test hook — clears all buckets and limits between tests. */
export function _resetRateLimits(): void {
  buckets.clear();
  limits.clear();
}

export const _internals = { DEFAULT_LIMIT, DESTRUCTIVE_LIMIT };
