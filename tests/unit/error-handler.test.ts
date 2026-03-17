import { describe, it, expect } from "vitest";
import { spotifyErrorToMcp, SpotifyApiError } from "../../src/utils/error-handler.js";

describe("error-handler", () => {
  describe("spotifyErrorToMcp", () => {
    it("handles SpotifyApiError", () => {
      const err = new SpotifyApiError("Custom message", 400);
      const result = spotifyErrorToMcp(err);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Custom message");
    });

    it("handles 401 status", () => {
      const err = Object.assign(new Error("Unauthorized"), { status: 401 });
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("Authentication expired");
    });

    it("handles 403 status", () => {
      const err = Object.assign(new Error("Forbidden"), { status: 403 });
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("Forbidden");
      expect(result.content[0].text).toContain("OAuth scopes");
    });

    it("handles 404 status", () => {
      const err = Object.assign(new Error("Not found"), { status: 404 });
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("Not found");
    });

    it("handles 429 with retry-after header", () => {
      const err = Object.assign(new Error("Rate limited"), {
        status: 429,
        headers: { "retry-after": "30" },
      });
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("Rate limited");
      expect(result.content[0].text).toContain("30 seconds");
    });

    it("handles 429 without retry-after header", () => {
      const err = Object.assign(new Error("Rate limited"), { status: 429 });
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("Rate limited");
    });

    it("handles unknown status codes", () => {
      const err = Object.assign(new Error("Server error"), {
        status: 500,
        message: "Internal Server Error",
      });
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("500");
    });

    it("handles statusCode property (alternative shape)", () => {
      const err = { statusCode: 403, message: "Forbidden" };
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("Forbidden");
    });

    it("handles ENOTFOUND network error", () => {
      const err = new Error("getaddrinfo ENOTFOUND api.spotify.com");
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("internet connection");
    });

    it("handles ECONNREFUSED network error", () => {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:443");
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toContain("internet connection");
    });

    it("handles generic Error", () => {
      const err = new Error("Something went wrong");
      const result = spotifyErrorToMcp(err);
      expect(result.content[0].text).toBe("Error: Something went wrong");
    });

    it("handles non-Error thrown values", () => {
      const result = spotifyErrorToMcp("string error");
      expect(result.content[0].text).toBe("An unexpected error occurred.");
    });

    it("handles null", () => {
      const result = spotifyErrorToMcp(null);
      expect(result.content[0].text).toBe("An unexpected error occurred.");
    });

    it("always returns isError: true", () => {
      expect(spotifyErrorToMcp(new Error("x")).isError).toBe(true);
      expect(spotifyErrorToMcp({ status: 500 }).isError).toBe(true);
      expect(spotifyErrorToMcp(null).isError).toBe(true);
    });
  });
});
