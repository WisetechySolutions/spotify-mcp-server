import { describe, it, expect } from "vitest";
import { startCallbackServer, escapeHtml } from "../../src/auth/callback-server.js";

describe("callback-server", () => {
  describe("escapeHtml", () => {
    it("escapes ampersand", () => {
      expect(escapeHtml("a&b")).toBe("a&amp;b");
    });

    it("escapes less-than", () => {
      expect(escapeHtml("a<b")).toBe("a&lt;b");
    });

    it("escapes greater-than", () => {
      expect(escapeHtml("a>b")).toBe("a&gt;b");
    });

    it("escapes double quotes", () => {
      expect(escapeHtml('a"b')).toBe("a&quot;b");
    });

    it("escapes single quotes", () => {
      expect(escapeHtml("a'b")).toBe("a&#x27;b");
    });

    it("escapes XSS script tag", () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
      );
    });

    it("escapes event handler injection", () => {
      expect(escapeHtml('" onmouseover="alert(1)')).toBe(
        "&quot; onmouseover=&quot;alert(1)"
      );
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("passes through safe text", () => {
      expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
    });
  });

  describe("startCallbackServer", () => {
    it("accepts valid callback with correct state", async () => {
      const state = "test-state-12345";
      const port = 18888;
      const serverPromise = startCallbackServer(port, state);

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(
        `http://127.0.0.1:${port}/callback?code=test-code&state=${state}`
      );

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Connected to Spotify");

      const { code, shutdown } = await serverPromise;
      expect(code).toBe("test-code");
      await shutdown();
    });

    it("rejects callback with wrong state (CSRF protection)", async () => {
      const port = 18889;
      // Attach .catch immediately to prevent unhandled rejection
      const serverPromise = startCallbackServer(port, "correct-state").catch(
        (e) => e
      );

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(
        `http://127.0.0.1:${port}/callback?code=test-code&state=wrong-state`
      );

      expect(res.status).toBe(400);

      const error = await serverPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("state mismatch");
    });

    it("rejects callback with missing state", async () => {
      const port = 18890;
      const serverPromise = startCallbackServer(port, "expected-state").catch(
        (e) => e
      );

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(
        `http://127.0.0.1:${port}/callback?code=test-code`
      );

      expect(res.status).toBe(400);

      const error = await serverPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("state mismatch");
    });

    it("handles Spotify error parameter", async () => {
      const port = 18891;
      const serverPromise = startCallbackServer(port, "state").catch((e) => e);

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(
        `http://127.0.0.1:${port}/callback?error=access_denied`
      );

      expect(res.status).toBe(400);

      const error = await serverPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("access_denied");
    });

    it("returns 404 for non-callback paths", async () => {
      const port = 18892;
      const serverPromise = startCallbackServer(port, "state");

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(`http://127.0.0.1:${port}/other`);
      expect(res.status).toBe(404);

      // Clean up
      await fetch(
        `http://127.0.0.1:${port}/callback?code=cleanup&state=state`
      );
      const { shutdown } = await serverPromise;
      await shutdown();
    });

    it("returns security headers", async () => {
      const port = 18893;
      const serverPromise = startCallbackServer(port, "state");

      await new Promise((r) => setTimeout(r, 100));

      const res = await fetch(
        `http://127.0.0.1:${port}/callback?code=test&state=state`
      );

      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");

      const { shutdown } = await serverPromise;
      await shutdown();
    });
  });
});
