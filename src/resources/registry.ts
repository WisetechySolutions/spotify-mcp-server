import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotifyFetch, isAuthenticated } from "../spotify/client.js";

/**
 * Register MCP resources — read-only data that Claude can access.
 */
export function registerResources(server: McpServer): void {
  // ─── USER PROFILE ─────────────────────────────────────────

  server.resource(
    "spotify-profile",
    "spotify://me/profile",
    {
      description: "Current Spotify user profile",
      mimeType: "application/json",
    },
    async () => {
      const authed = await isAuthenticated();
      if (!authed) {
        return {
          contents: [
            {
              uri: "spotify://me/profile",
              mimeType: "text/plain",
              text: "Not authenticated. Use any Spotify tool to trigger authorization.",
            },
          ],
        };
      }

      const response = await spotifyFetch("/me");
      if (!response.ok) {
        return {
          contents: [
            {
              uri: "spotify://me/profile",
              mimeType: "text/plain",
              text: `Failed to fetch profile: ${response.status}`,
            },
          ],
        };
      }

      const profile = (await response.json()) as Record<string, unknown>;

      // Only expose non-sensitive fields
      const safe = {
        display_name: profile.display_name,
        id: profile.id,
        product: profile.product, // "premium", "free", etc.
        country: profile.country,
      };

      return {
        contents: [
          {
            uri: "spotify://me/profile",
            mimeType: "application/json",
            text: JSON.stringify(safe, null, 2),
          },
        ],
      };
    }
  );

  // ─── AUTH STATUS ──────────────────────────────────────────

  server.resource(
    "spotify-auth-status",
    "spotify://auth/status",
    {
      description: "Whether the Spotify connection is active",
      mimeType: "application/json",
    },
    async () => {
      const authed = await isAuthenticated();
      return {
        contents: [
          {
            uri: "spotify://auth/status",
            mimeType: "application/json",
            text: JSON.stringify({
              authenticated: authed,
              message: authed
                ? "Connected to Spotify. Ready to create playlists."
                : "Not connected. Use any Spotify tool to trigger authorization.",
            }),
          },
        ],
      };
    }
  );
}
