import { randomBytes, createHash } from "node:crypto";

const VERIFIER_LENGTH = 128;

/**
 * Generate a cryptographically random PKCE code verifier.
 * Uses rejection sampling to eliminate modulo bias.
 */
export function generateCodeVerifier(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const maxValid = 256 - (256 % chars.length); // Rejection threshold
  let verifier = "";

  while (verifier.length < VERIFIER_LENGTH) {
    const bytes = randomBytes(VERIFIER_LENGTH); // Over-generate to reduce loops
    for (let i = 0; i < bytes.length && verifier.length < VERIFIER_LENGTH; i++) {
      if (bytes[i] < maxValid) {
        verifier += chars[bytes[i] % chars.length];
      }
    }
  }

  return verifier;
}

/**
 * Derive the PKCE code challenge from a verifier.
 * Method: S256 (SHA-256 hash, base64url-encoded)
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build the full Spotify authorization URL.
 */
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state: string;
}): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Exchange an authorization code for tokens using PKCE.
 * Error messages are sanitized — raw Spotify responses are not leaked.
 */
export async function exchangeCodeForTokens(params: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Token exchange failed (HTTP ${response.status}). Please retry authorization.`
    );
  }

  const data: unknown = await response.json();
  return validateTokenResponse(data, "Token exchange");
}

/**
 * Refresh an access token using a refresh token (PKCE flow).
 * Error messages are sanitized — raw Spotify responses are not leaked.
 */
export async function refreshAccessToken(params: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: params.clientId,
    refresh_token: params.refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Token refresh failed (HTTP ${response.status}). Re-authorization may be required.`
    );
  }

  const data: unknown = await response.json();
  return validateTokenResponse(data, "Token refresh");
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string; // May be absent on refresh (only guaranteed on initial auth)
  scope: string;
}

/**
 * Validate the shape of a token response from Spotify.
 * Prevents trusting raw API responses without structural verification.
 */
function validateTokenResponse(data: unknown, context: string): TokenResponse {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${context} returned invalid response structure`);
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.access_token !== "string" || obj.access_token.length === 0) {
    throw new Error(`${context} response missing valid access_token`);
  }
  if (typeof obj.token_type !== "string") {
    throw new Error(`${context} response missing valid token_type`);
  }
  if (typeof obj.expires_in !== "number" || !Number.isFinite(obj.expires_in) || obj.expires_in <= 0) {
    throw new Error(`${context} response has invalid expires_in`);
  }
  if (obj.refresh_token !== undefined && typeof obj.refresh_token !== "string") {
    throw new Error(`${context} response has invalid refresh_token`);
  }
  if (typeof obj.scope !== "string") {
    throw new Error(`${context} response missing valid scope`);
  }

  return {
    access_token: obj.access_token,
    token_type: obj.token_type,
    expires_in: obj.expires_in,
    refresh_token: obj.refresh_token as string | undefined,
    scope: obj.scope,
  };
}

/**
 * Generate a random state parameter to prevent CSRF.
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}
