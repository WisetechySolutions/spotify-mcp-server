import { describe, it, expect } from "vitest";
import { readBodyWithCap, safeParseJsonResponse } from "../../src/spotify/client.js";

const MAX = 1_048_576; // 1MB cap mirrored from client.ts

/**
 * Build a Response whose body is a ReadableStream that emits `chunkCount`
 * chunks of `chunkSize` bytes each, WITHOUT a Content-Length header.
 *
 * This simulates a hostile/buggy upstream that omits the size header — the
 * pre-streaming `content-length` check is skipped, so the cap must be enforced
 * during transfer by reading bytes incrementally.
 */
function streamingResponse(
  chunkSize: number,
  chunkCount: number,
  contentType = "application/json"
): Response {
  let emitted = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= chunkCount) {
        controller.close();
        return;
      }
      emitted++;
      controller.enqueue(new Uint8Array(chunkSize).fill(120)); // 'x'
    },
  });
  return new Response(stream, {
    headers: { "content-type": contentType }, // deliberately NO content-length
  });
}

describe("streaming response size cap (readBodyWithCap)", () => {
  it("aborts an oversized body that omits Content-Length (during transfer)", async () => {
    // 1100 chunks * 1024 bytes ≈ 1.1MB, no Content-Length header.
    const res = streamingResponse(1024, 1100);
    await expect(readBodyWithCap(res)).rejects.toThrow(
      "exceeds maximum allowed size"
    );
  });

  it("does not buffer the entire oversized body before throwing", async () => {
    // Track how many bytes the producer was asked for. If the cap were enforced
    // post-download, the producer would be drained to completion (~10MB). With
    // streaming enforcement it stops shortly after crossing 1MB.
    let produced = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= 10 * MAX) {
          controller.close();
          return;
        }
        produced += 64 * 1024;
        controller.enqueue(new Uint8Array(64 * 1024).fill(120));
      },
    });
    const res = new Response(stream, {
      headers: { "content-type": "application/json" },
    });

    await expect(readBodyWithCap(res)).rejects.toThrow(
      "exceeds maximum allowed size"
    );
    // Should have stopped well before draining the full 10MB producer.
    expect(produced).toBeLessThan(2 * MAX);
  });

  it("accepts a body at exactly the cap", async () => {
    const res = streamingResponse(MAX, 1); // exactly 1MB, valid JSON not required here
    const text = await readBodyWithCap(res);
    expect(Buffer.byteLength(text, "utf8")).toBe(MAX);
  });

  it("returns small bodies intact", async () => {
    const res = streamingResponse(10, 3); // 30 bytes
    const text = await readBodyWithCap(res);
    expect(text).toBe("x".repeat(30));
  });

  it("safeParseJsonResponse enforces the cap on a header-less oversized JSON body", async () => {
    const res = streamingResponse(1024, 1100); // ~1.1MB
    await expect(safeParseJsonResponse(res)).rejects.toThrow(
      "exceeds maximum allowed size"
    );
  });

  it("safeParseJsonResponse still rejects non-JSON content types", async () => {
    const res = streamingResponse(10, 1, "text/html");
    await expect(safeParseJsonResponse(res)).rejects.toThrow(
      "Unexpected Content-Type"
    );
  });

  it("safeParseJsonResponse parses a small valid JSON body", async () => {
    const payload = JSON.stringify({ ok: true, n: 42 });
    const res = new Response(payload, {
      headers: { "content-type": "application/json" },
    });
    const parsed = (await safeParseJsonResponse(res)) as { ok: boolean; n: number };
    expect(parsed.ok).toBe(true);
    expect(parsed.n).toBe(42);
  });
});
