import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, resetConfig } from "../../src/utils/config.js";

describe("config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  it("throws on missing SPOTIFY_CLIENT_ID", () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => getConfig()).toThrow("SPOTIFY_CLIENT_ID");
  });

  it("throws on invalid TOKEN_ENCRYPTION_KEY length", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "tooshort";
    expect(() => getConfig()).toThrow("64 hex characters");
  });

  it("rejects non-hex TOKEN_ENCRYPTION_KEY", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "g".repeat(64);
    expect(() => getConfig()).toThrow("hex");
  });

  it("parses valid config", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const config = getConfig();
    expect(config.SPOTIFY_CLIENT_ID).toBe("test-id");
    expect(config.SPOTIFY_REDIRECT_URI).toBe("http://127.0.0.1:8888/callback");
  });

  it("accepts custom SPOTIFY_REDIRECT_URI", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:9999/callback";
    const config = getConfig();
    expect(config.SPOTIFY_REDIRECT_URI).toBe("http://127.0.0.1:9999/callback");
  });

  it("expands ~ in TOKEN_STORAGE_PATH using path.join", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TOKEN_STORAGE_PATH = "~/.spotify-mcp/tokens.enc";
    const config = getConfig();
    expect(config.TOKEN_STORAGE_PATH).not.toContain("~");
    expect(config.TOKEN_STORAGE_PATH).toContain(".spotify-mcp");
  });

  it("handles absolute TOKEN_STORAGE_PATH without ~", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TOKEN_STORAGE_PATH = "/tmp/tokens.enc";
    const config = getConfig();
    expect(config.TOKEN_STORAGE_PATH).toBe("/tmp/tokens.enc");
  });

  it("throws when ~ used but HOME and USERPROFILE are unset", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TOKEN_STORAGE_PATH = "~/.spotify-mcp/tokens.enc";
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    expect(() => getConfig()).toThrow("HOME nor USERPROFILE");
  });

  it("caches config on subsequent calls", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const a = getConfig();
    const b = getConfig();
    expect(a).toBe(b); // Same reference
  });

  it("rejects invalid SPOTIFY_REDIRECT_URI", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-id";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.SPOTIFY_REDIRECT_URI = "not-a-url";
    expect(() => getConfig()).toThrow();
  });
});
