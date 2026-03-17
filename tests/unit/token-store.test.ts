import { describe, it, expect, afterEach } from "vitest";
import { TokenStore } from "../../src/auth/token-store.js";
import { randomBytes } from "node:crypto";
import { unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_KEY = randomBytes(32).toString("hex");
const TEST_DIR = join(tmpdir(), "spotify-mcp-test-" + Date.now());
const TEST_PATH = join(TEST_DIR, "tokens.enc");

describe("TokenStore", () => {
  afterEach(async () => {
    try {
      await rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it("returns null when no token file exists", async () => {
    const store = new TokenStore(TEST_PATH, TEST_KEY);
    const tokens = await store.load();
    expect(tokens).toBeNull();
  });

  it("saves and loads tokens", async () => {
    const store = new TokenStore(TEST_PATH, TEST_KEY);
    const tokens = {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresAt: Date.now() + 3600 * 1000,
      scope: "playlist-read-private",
    };

    await store.save(tokens);
    const loaded = await store.load();
    expect(loaded).toEqual(tokens);
  });

  it("deletes tokens", async () => {
    const store = new TokenStore(TEST_PATH, TEST_KEY);
    await store.save({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 3600_000,
      scope: "test",
    });

    await store.delete();
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it("delete is idempotent", async () => {
    const store = new TokenStore(TEST_PATH, TEST_KEY);
    await store.delete(); // file doesn't exist
    await store.delete(); // still doesn't exist
    // Should not throw
  });

  it("reports valid tokens correctly", async () => {
    const store = new TokenStore(TEST_PATH, TEST_KEY);

    // Not valid — no file
    expect(await store.hasValidTokens()).toBe(false);

    // Valid — future expiry
    await store.save({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 3600_000,
      scope: "test",
    });
    expect(await store.hasValidTokens()).toBe(true);

    // Not valid — expired
    await store.save({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() - 1000,
      scope: "test",
    });
    expect(await store.hasValidTokens()).toBe(false);
  });

  it("fails to load with wrong encryption key", async () => {
    const store = new TokenStore(TEST_PATH, TEST_KEY);
    await store.save({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 3600_000,
      scope: "test",
    });

    const wrongKeyStore = new TokenStore(TEST_PATH, randomBytes(32).toString("hex"));
    await expect(wrongKeyStore.load()).rejects.toThrow();
  });
});
