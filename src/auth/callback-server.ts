import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

const TIMEOUT_MS = 120_000; // Auto-shutdown after 2 minutes
const MAX_REQUEST_SIZE = 4096; // 4KB max request size
const REQUEST_TIMEOUT_MS = 5_000; // 5s timeout per request (anti-slowloris)
const MAX_CALLBACK_REQUESTS = 5; // Rate limit: max requests before forced shutdown
const CODE_PATTERN = /^[a-zA-Z0-9_-]{1,512}$/; // OAuth codes are alphanumeric, reasonable length

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Referrer-Policy": "no-referrer",
};

/**
 * Ephemeral localhost HTTP server that catches the OAuth redirect.
 * Binds to 127.0.0.1 only (not 0.0.0.0) for security.
 * Auto-shuts down after receiving the callback or after timeout.
 *
 * Security hardening:
 * - Request size limit (4KB) to reject oversized payloads
 * - Per-request timeout (5s) to prevent slowloris attacks
 * - Rate limiting (max 5 requests) before forced shutdown
 * - OAuth code format validation
 */
export function startCallbackServer(
  port: number,
  expectedState: string
): Promise<{ code: string; shutdown: () => Promise<void> }> {
  // Validate port is a reasonable number
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.reject(new Error("Invalid port number"));
  }

  return new Promise((resolve, reject) => {
    let server: Server;
    let timeoutId: ReturnType<typeof setTimeout>;
    let settled = false;
    let requestCount = 0;

    const shutdown = (): Promise<void> =>
      new Promise((res) => {
        clearTimeout(timeoutId);
        server.close(() => res());
      });

    const settle = (
      action: "resolve" | "reject",
      value: { code: string; shutdown: () => Promise<void> } | Error
    ) => {
      if (settled) return;
      settled = true;
      if (action === "resolve") {
        resolve(value as { code: string; shutdown: () => Promise<void> });
      } else {
        reject(value as Error);
        shutdown();
      }
    };

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Rate limiting: reject after too many requests
      requestCount++;
      if (requestCount > MAX_CALLBACK_REQUESTS) {
        res.writeHead(429, SECURITY_HEADERS);
        res.end(errorPage("Too many requests. Server shutting down."));
        settle("reject", new Error("Callback server rate limit exceeded"));
        return;
      }

      // Per-request timeout to prevent slowloris
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        res.writeHead(408, SECURITY_HEADERS);
        res.end(errorPage("Request timeout."));
        req.destroy();
      });

      // Enforce request size limit
      let dataSize = 0;
      req.on("data", (chunk: Buffer) => {
        dataSize += chunk.length;
        if (dataSize > MAX_REQUEST_SIZE) {
          res.writeHead(413, SECURITY_HEADERS);
          res.end(errorPage("Request too large."));
          req.destroy();
        }
      });

      // Validate URL length before parsing (the URL is in the request line)
      const rawUrl = req.url ?? "/";
      if (rawUrl.length > MAX_REQUEST_SIZE) {
        res.writeHead(414, SECURITY_HEADERS);
        res.end(errorPage("URI too long."));
        return;
      }

      const url = new URL(rawUrl, `http://127.0.0.1:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404, SECURITY_HEADERS);
        res.end(errorPage("Not found."));
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, SECURITY_HEADERS);
        // Only show a sanitized version of the error — don't reflect raw input verbatim
        const safeError = typeof error === "string" && error.length < 200
          ? error.replace(/[^a-zA-Z0-9_\- ]/g, "")
          : "authorization_error";
        res.end(errorPage(safeError));
        settle("reject", new Error(`Spotify authorization denied: ${safeError}`));
        return;
      }

      if (!code || !state || state.length !== expectedState.length ||
          !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
        res.writeHead(400, SECURITY_HEADERS);
        res.end(errorPage("Invalid callback — state mismatch or missing code."));
        settle("reject", new Error("Invalid OAuth callback: state mismatch or missing code"));
        return;
      }

      // Validate OAuth code format
      if (!CODE_PATTERN.test(code)) {
        res.writeHead(400, SECURITY_HEADERS);
        res.end(errorPage("Invalid authorization code format."));
        settle("reject", new Error("Invalid OAuth callback: malformed authorization code"));
        return;
      }

      res.writeHead(200, SECURITY_HEADERS);
      res.end(successPage());
      settle("resolve", { code, shutdown });
    });

    // Ensure server ONLY listens on configured port on loopback
    server.listen(port, "127.0.0.1", () => {
      // Verify the server is actually on the expected port
      const addr = server.address();
      if (addr && typeof addr === "object" && addr.port !== port) {
        settle("reject", new Error(`Server bound to unexpected port ${addr.port}`));
        return;
      }

      timeoutId = setTimeout(() => {
        settle("reject", new Error("OAuth callback timed out after 2 minutes."));
      }, TIMEOUT_MS);
    });

    server.on("error", (err) => {
      settle("reject", new Error(`Callback server failed to start: ${err.message}`));
    });
  });
}

function successPage(): string {
  return `<!DOCTYPE html>
<html>
<head><title>Spotify MCP — Authorized</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             display: flex; align-items: center; justify-content: center;
             min-height: 100vh; margin: 0; background: #191414; color: #1DB954;">
  <div style="text-align: center; max-width: 480px;">
    <h1 style="font-size: 2rem;">&#10003; Connected to Spotify</h1>
    <p style="color: #b3b3b3; font-size: 1.1rem;">
      You can close this tab and return to Claude.<br>
      Your Spotify MCP server is ready.
    </p>
  </div>
</body>
</html>`;
}

function errorPage(error: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Spotify MCP — Error</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             display: flex; align-items: center; justify-content: center;
             min-height: 100vh; margin: 0; background: #191414; color: #e74c3c;">
  <div style="text-align: center; max-width: 480px;">
    <h1 style="font-size: 2rem;">&#10007; Authorization Failed</h1>
    <p style="color: #b3b3b3; font-size: 1.1rem;">${escapeHtml(error)}</p>
    <p style="color: #666;">Please try again from Claude.</p>
  </div>
</body>
</html>`;
}

/** Escape all HTML special characters including single quotes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
