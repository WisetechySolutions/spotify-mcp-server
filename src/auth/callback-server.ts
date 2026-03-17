import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

const TIMEOUT_MS = 120_000; // Auto-shutdown after 2 minutes

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

    const shutdown = (): Promise<void> =>
      new Promise((res) => {
        clearTimeout(timeoutId);
        server.close(() => res());
      });

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(errorPage(error));
        reject(new Error(`Spotify authorization denied: ${error}`));
        shutdown();
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(errorPage("Invalid callback — state mismatch or missing code."));
        reject(new Error("Invalid OAuth callback: state mismatch or missing code"));
        shutdown();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(successPage());
      resolve({ code, shutdown });
    });

    server.listen(port, "127.0.0.1", () => {
      // Auto-shutdown after timeout
      timeoutId = setTimeout(() => {
        reject(new Error("OAuth callback timed out after 2 minutes."));
        server.close();
      }, TIMEOUT_MS);
    });

    server.on("error", (err) => {
      reject(new Error(`Callback server failed to start: ${err.message}`));
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
