/**
 * Maps Spotify API errors to user-friendly MCP error responses.
 */

export interface McpToolError {
  [x: string]: unknown;
  isError: true;
  content: Array<{ type: "text"; text: string }>;
}

export function spotifyErrorToMcp(error: unknown): McpToolError {
  if (error instanceof SpotifyApiError) {
    return makeError(error.userMessage);
  }

  if (isSpotifyResponseError(error)) {
    const status = error.status ?? error.statusCode;
    switch (status) {
      case 401:
        return makeError(
          "Authentication expired. The server will attempt to refresh automatically. Please retry your request."
        );
      case 403:
        return makeError(
          "Forbidden — missing permissions. Ensure the OAuth scopes include playlist-modify-public, playlist-modify-private, and playlist-read-private."
        );
      case 404:
        return makeError(
          "Not found. The playlist or track ID may be invalid or deleted."
        );
      case 429: {
        const retryAfter = error.headers?.["retry-after"];
        const wait = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
        return makeError(`Rate limited by Spotify.${wait} Please wait and retry.`);
      }
      default:
        return makeError(
          `Spotify API error (${status}): ${error.message || "Unknown error"}`
        );
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
      return makeError(
        "Cannot reach Spotify API. Check your internet connection."
      );
    }
    return makeError(`Error: ${error.message}`);
  }

  return makeError("An unexpected error occurred.");
}

export class SpotifyApiError extends Error {
  constructor(
    public userMessage: string,
    public statusCode?: number
  ) {
    super(userMessage);
    this.name = "SpotifyApiError";
  }
}

function isSpotifyResponseError(
  err: unknown
): err is { status?: number; statusCode?: number; message?: string; headers?: Record<string, string> } {
  return typeof err === "object" && err !== null && ("status" in err || "statusCode" in err);
}

function makeError(text: string): McpToolError {
  return {
    isError: true,
    content: [{ type: "text", text }],
  };
}
