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
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "tooshort";
    expect(() => getConfig()).toThrow("64 hex characters");
  });

  it("rejects non-hex TOKEN_ENCRYPTION_KEY", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "g".repeat(64);
    expect(() => getConfig()).toThrow("hex");
  });

  it("parses valid config", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const config = getConfig();
    expect(config.SPOTIFY_CLIENT_ID).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
    expect(config.SPOTIFY_REDIRECT_URI).toBe("http://127.0.0.1:8888/callback");
  });

  it("accepts custom SPOTIFY_REDIRECT_URI", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:9999/callback";
    const config = getConfig();
    expect(config.SPOTIFY_REDIRECT_URI).toBe("http://127.0.0.1:9999/callback");
  });

  it("expands ~ in TOKEN_STORAGE_PATH using path.join", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TOKEN_STORAGE_PATH = "~/.spotify-mcp/tokens.enc";
    const config = getConfig();
    expect(config.TOKEN_STORAGE_PATH).not.toContain("~");
    expect(config.TOKEN_STORAGE_PATH).toContain(".spotify-mcp");
  });

  it("handles absolute TOKEN_STORAGE_PATH within home dir", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const tokenPath = `${home}/.spotify-mcp-test/tokens.enc`;
    process.env.TOKEN_STORAGE_PATH = tokenPath;
    const config = getConfig();
    expect(config.TOKEN_STORAGE_PATH).toBe(tokenPath);
  });

  it("rejects TOKEN_STORAGE_PATH outside home directory", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TOKEN_STORAGE_PATH = "/tmp/tokens.enc";
    expect(() => getConfig()).toThrow("home directory");
  });

  it("throws when ~ used but HOME and USERPROFILE are unset", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TOKEN_STORAGE_PATH = "~/.spotify-mcp/tokens.enc";
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    expect(() => getConfig()).toThrow("HOME nor USERPROFILE");
  });

  it("caches config on subsequent calls", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const a = getConfig();
    const b = getConfig();
    expect(a).toBe(b); // Same reference
  });

  it("rejects invalid SPOTIFY_REDIRECT_URI", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.SPOTIFY_REDIRECT_URI = "not-a-url";
    expect(() => getConfig()).toThrow();
  });

  it("rejects non-hex SPOTIFY_CLIENT_ID", () => {
    process.env.SPOTIFY_CLIENT_ID = "not-a-valid-client-id-value!!!";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    expect(() => getConfig()).toThrow("32-character hex");
  });

  it("rejects SPOTIFY_CLIENT_ID with wrong length", () => {
    process.env.SPOTIFY_CLIENT_ID = "abcdef";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    expect(() => getConfig()).toThrow("32-character hex");
  });

  it("returns frozen config object", () => {
    process.env.SPOTIFY_CLIENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const config = getConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });
});
