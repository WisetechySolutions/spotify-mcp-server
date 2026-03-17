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

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const MAX_RETRY_AFTER_SECONDS = 60;
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESPONSE_SIZE = 1_048_576; // 1MB max response size
const REQUEST_TIMEOUT_MS = 10_000; // 10 second request timeout
const ALLOWED_API_HOSTS = new Set(["api.spotify.com", "accounts.spotify.com"]);

let _accessToken: string | null = null;
let _tokenExpiresAt = 0;
let _tokenStore: TokenStore | null = null;
let _refreshPromise: Promise<string> | null = null;
let _cachedUserId: string | null = null;

function getTokenStore(): TokenStore {
  if (!_tokenStore) {
    const config = getConfig();
    _tokenStore = new TokenStore(config.TOKEN_STORAGE_PATH, config.TOKEN_ENCRYPTION_KEY);
  }
  return _tokenStore;
}

/**
 * Get a valid access token, refreshing or re-authenticating as needed.
 * Uses a mutex to prevent concurrent refresh races.
 * Checks in-memory expiry before returning cached token.
 */
export async function getAccessToken(): Promise<string> {
  // Check in-memory token with expiry
  if (_accessToken && Date.now() < _tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    return _accessToken;
  }

  // Clear stale in-memory token
  if (_accessToken && Date.now() >= _tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    _accessToken = null;
  }

  // Mutex: if a refresh is already in-flight, wait for it
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = doGetAccessToken().finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

async function doGetAccessToken(): Promise<string> {
  const store = getTokenStore();
  const tokens = await store.load();

  if (tokens) {
    if (Date.now() < tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      _accessToken = tokens.accessToken;
      _tokenExpiresAt = tokens.expiresAt;
      return _accessToken;
    }

    // Token expired — try refresh
    try {
      const config = getConfig();
      const refreshed = await refreshAccessToken({
        clientId: config.SPOTIFY_CLIENT_ID,
        refreshToken: tokens.refreshToken,
      });
      // Preserve old refresh token if new one not provided
      await saveTokenResponse(refreshed, tokens.refreshToken);
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
 *
 * SECURITY:
 * - Only allows paths relative to the Spotify API base URL (anti-SSRF)
 * - Validates final URL resolves to allowed Spotify hosts only
 * - Enforces response size limit (1MB)
 * - Enforces request timeout (10s)
 * - Validates response Content-Type before JSON parsing
 * - Never leaks tokens in error messages
 */
export async function spotifyFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  // SECURITY: Reject absolute URLs to prevent SSRF
  if (path.startsWith("http://") || path.startsWith("https://")) {
    throw new Error("Absolute URLs are not allowed. Use relative paths (e.g., /search).");
  }

  // SECURITY: Validate the constructed URL resolves to an allowed host
  const url = `${SPOTIFY_API_BASE}${path}`;
  const parsedUrl = new URL(url);
  if (!ALLOWED_API_HOSTS.has(parsedUrl.hostname)) {
    throw new Error("Request URL resolved to a disallowed host.");
  }

  await rateLimiter.acquire();

  const token = await getAccessToken();

  const makeRequest = async (bearerToken: string): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      // SECURITY: Enforce response size limit
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new Error("Spotify API response exceeds maximum allowed size (1MB).");
      }

      return response;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Spotify API request timed out (10s limit).");
      }
      // SECURITY: Never leak tokens in error messages
      if (err instanceof Error && err.message.includes(bearerToken)) {
        throw new Error("Spotify API request failed.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const response = await makeRequest(token);

  // Handle 429 rate limiting
  if (response.status === 429) {
    const rawRetryAfter = parseInt(response.headers.get("retry-after") ?? "5", 10);
    const retryAfter = Math.min(Math.max(rawRetryAfter, 1), MAX_RETRY_AFTER_SECONDS);
    rateLimiter.onRateLimited(retryAfter);

    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    await rateLimiter.acquire();
    return makeRequest(token);
  }

  // Handle 401 — try refresh and retry once
  if (response.status === 401) {
    _accessToken = null;
    _tokenExpiresAt = 0;
    const newToken = await getAccessToken();
    return makeRequest(newToken);
  }

  return response;
}

/**
 * Safely parse a JSON response from Spotify, validating Content-Type.
 * Use this instead of raw response.json() for defense-in-depth.
 *
 * SECURITY: Validates Content-Type header contains application/json
 * and enforces response body size limit.
 */
export async function safeParseJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected Content-Type from Spotify API: ${contentType.slice(0, 100)}`);
  }

  // Read body as text first to enforce size limit
  const text = await response.text();
  if (text.length > MAX_RESPONSE_SIZE) {
    throw new Error("Spotify API response body exceeds maximum allowed size (1MB).");
  }

  return JSON.parse(text);
}

/**
 * Sanitize user input for use in API query parameters.
 * Removes null bytes and control characters that could cause issues.
 */
export function sanitizeQueryParam(input: string): string {
  // Remove null bytes and control characters (except space, which is valid in search queries)
  return input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Get the current user's Spotify ID. Cached after first call.
 */
export async function getCurrentUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId;

  const response = await spotifyFetch("/me");
  if (!response.ok) {
    throw Object.assign(
      new Error(`Failed to get user profile (HTTP ${response.status}).`),
      { status: response.status }
    );
  }
  const me = (await response.json()) as { id: string };
  _cachedUserId = me.id;
  return _cachedUserId;
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

  // Open browser
  const open = (await import("open")).default;
  await open(authUrl);

  process.stderr.write(
    "\n🎵 Spotify authorization required.\n" +
      "   A browser window should have opened.\n" +
      "   If not, check your browser.\n\n"
  );

  const { code, shutdown } = await callbackPromise;

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

/**
 * Save token response. Preserves old refresh token if new one not provided.
 */
async function saveTokenResponse(
  response: TokenResponse,
  fallbackRefreshToken?: string
): Promise<void> {
  const store = getTokenStore();
  const refreshToken = response.refresh_token ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error("No refresh token available. Re-authorization required.");
  }

  const expiresAt = Date.now() + response.expires_in * 1000;
  const tokens: StoredTokens = {
    accessToken: response.access_token,
    refreshToken,
    expiresAt,
    scope: response.scope,
  };
  await store.save(tokens);
  _accessToken = response.access_token;
  _tokenExpiresAt = expiresAt;
}

/**
 * Delete all stored tokens (data deletion / logout).
 */
export async function deleteTokens(): Promise<void> {
  const store = getTokenStore();
  await store.delete();
  _accessToken = null;
  _tokenExpiresAt = 0;
  _cachedUserId = null;
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
  _tokenExpiresAt = 0;
  _tokenStore = null;
  _refreshPromise = null;
  _cachedUserId = null;
}
