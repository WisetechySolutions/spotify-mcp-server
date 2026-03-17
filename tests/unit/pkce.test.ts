import { describe, it, expect } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
} from "../../src/auth/pkce.js";

describe("PKCE", () => {
  describe("generateCodeVerifier", () => {
    it("returns a 128-character string", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(128);
    });

    it("uses only unreserved URI characters", () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it("generates unique values", () => {
      const a = generateCodeVerifier();
      const b = generateCodeVerifier();
      expect(a).not.toBe(b);
    });
  });

  describe("generateCodeChallenge", () => {
    it("produces a base64url string without padding", () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/); // base64url, no =
      expect(challenge).not.toContain("+");
      expect(challenge).not.toContain("/");
      expect(challenge).not.toContain("=");
    });

    it("is deterministic for the same verifier", () => {
      const verifier = generateCodeVerifier();
      const a = generateCodeChallenge(verifier);
      const b = generateCodeChallenge(verifier);
      expect(a).toBe(b);
    });

    // Known test vector from RFC 7636 Appendix B
    it("matches RFC 7636 test vector", () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const challenge = generateCodeChallenge(verifier);
      expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    });
  });

  describe("generateState", () => {
    it("returns a 64-character hex string", () => {
      const state = generateState();
      expect(state).toHaveLength(64);
      expect(state).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("buildAuthUrl", () => {
    it("builds a valid Spotify authorize URL", () => {
      const url = buildAuthUrl({
        clientId: "test-client-id",
        redirectUri: "http://localhost:8888/callback",
        codeChallenge: "test-challenge",
        scopes: ["playlist-read-private", "playlist-modify-public"],
        state: "test-state",
      });

      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://accounts.spotify.com");
      expect(parsed.pathname).toBe("/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:8888/callback");
      expect(parsed.searchParams.get("scope")).toBe("playlist-read-private playlist-modify-public");
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
      expect(parsed.searchParams.get("state")).toBe("test-state");
    });
  });
});
