import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

const TIMEOUT_MS = 120_000; // Auto-shutdown after 2 minutes

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
 */
export function startCallbackServer(
  port: number,
  expectedState: string
): Promise<{ code: string; shutdown: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    let server: Server;
    let timeoutId: ReturnType<typeof setTimeout>;
    let settled = false;

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
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

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
        res.end(errorPage(error));
        settle("reject", new Error(`Spotify authorization denied: ${error}`));
        return;
      }

      if (!code || !state || state !== expectedState) {
        res.writeHead(400, SECURITY_HEADERS);
        res.end(errorPage("Invalid callback — state mismatch or missing code."));
        settle("reject", new Error("Invalid OAuth callback: state mismatch or missing code"));
        return;
      }

      res.writeHead(200, SECURITY_HEADERS);
      res.end(successPage());
      settle("resolve", { code, shutdown });
    });

    server.listen(port, "127.0.0.1", () => {
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
