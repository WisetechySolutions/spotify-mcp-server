import { getConfig } from "../utils/config.js";
import { TokenStore, type StoredTokens } from "../auth/token-store.js";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  type TokenResponse,
} from "../auth/pkce.js";
import { startCallbackServer } from "../auth/callback-server.js";
import { rateLimiter } from "../utils/rate-limiter.js";

const SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-private",
];

let _accessToken: string | null = null;
let _tokenStore: TokenStore | null = null;

function getTokenStore(): TokenStore {
  if (!_tokenStore) {
    const config = getConfig();
    _tokenStore = new TokenStore(config.TOKEN_STORAGE_PATH, config.TOKEN_ENCRYPTION_KEY);
  }
  return _tokenStore;
}

/**
 * Get a valid access token, refreshing or re-authenticating as needed.
 */
export async function getAccessToken(): Promise<string> {
  if (_accessToken) return _accessToken;

  const store = getTokenStore();
  const tokens = await store.load();

  if (tokens) {
    const bufferMs = 5 * 60 * 1000;
    if (Date.now() < tokens.expiresAt - bufferMs) {
      _accessToken = tokens.accessToken;
      return _accessToken;
    }

    // Token expired — try refresh
    try {
      const config = getConfig();
      const refreshed = await refreshAccessToken({
        clientId: config.SPOTIFY_CLIENT_ID,
        refreshToken: tokens.refreshToken,
      });
      await saveTokenResponse(refreshed);
      return _accessToken!;
    } catch {
      // Refresh failed — need full re-auth
    }
  }

  // No tokens or refresh failed — run OAuth flow
  await runOAuthFlow();
  return _accessToken!;
}

/**
 * Make an authenticated request to the Spotify API.
 * Handles rate limiting and automatic token refresh on 401.
 */
export async function spotifyFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  await rateLimiter.acquire();

  const token = await getAccessToken();
  const url = path.startsWith("http")
    ? path
    : `https://api.spotify.com/v1${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Handle 429 rate limiting
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") ?? "5", 10);
    rateLimiter.onRateLimited(retryAfter);

    // Retry once after waiting
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    await rateLimiter.acquire();
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  // Handle 401 — try refresh and retry once
  if (response.status === 401) {
    _accessToken = null;
    const newToken = await getAccessToken();
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${newToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  return response;
}

/**
 * Run the full OAuth PKCE flow — opens browser, waits for callback.
 */
async function runOAuthFlow(): Promise<void> {
  const config = getConfig();
  const redirectUrl = new URL(config.SPOTIFY_REDIRECT_URI);
  const port = parseInt(redirectUrl.port, 10);

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  const authUrl = buildAuthUrl({
    clientId: config.SPOTIFY_CLIENT_ID,
    redirectUri: config.SPOTIFY_REDIRECT_URI,
    codeChallenge: challenge,
    scopes: SCOPES,
    state,
  });

  // Start callback server before opening browser
  const callbackPromise = startCallbackServer(port, state);

  // Open browser — dynamic import since 'open' is ESM
  const open = (await import("open")).default;
  await open(authUrl);

  // Log to stderr so it doesn't interfere with MCP stdio transport
  process.stderr.write(
    "\n🎵 Spotify authorization required.\n" +
      "   A browser window should have opened.\n" +
      "   If not, visit this URL:\n" +
      `   ${authUrl}\n\n`
  );

  const { code, shutdown } = await callbackPromise;

  // Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens({
    clientId: config.SPOTIFY_CLIENT_ID,
    code,
    redirectUri: config.SPOTIFY_REDIRECT_URI,
    codeVerifier: verifier,
  });

  await saveTokenResponse(tokenResponse);
  await shutdown();

  process.stderr.write("✓ Spotify connected successfully.\n\n");
}

async function saveTokenResponse(response: TokenResponse): Promise<void> {
  const store = getTokenStore();
  const tokens: StoredTokens = {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    scope: response.scope,
  };
  await store.save(tokens);
  _accessToken = response.access_token;
}

/**
 * Delete all stored tokens (data deletion / logout).
 */
export async function deleteTokens(): Promise<void> {
  const store = getTokenStore();
  await store.delete();
  _accessToken = null;
}

/**
 * Check if the user is currently authenticated.
 */
export async function isAuthenticated(): Promise<boolean> {
  const store = getTokenStore();
  return store.hasValidTokens();
}

/** Reset client state (for testing) */
export function resetClient(): void {
  _accessToken = null;
  _tokenStore = null;
}
