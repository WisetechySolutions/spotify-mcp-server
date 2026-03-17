import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../../src/utils/crypto.js";
import { randomBytes } from "node:crypto";

const TEST_KEY = randomBytes(32).toString("hex"); // 64 hex chars = 32 bytes

describe("crypto", () => {
  it("encrypts and decrypts a string roundtrip", () => {
    const plaintext = "hello world, this is a secret token";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same input";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with wrong key", () => {
    const plaintext = "secret";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const wrongKey = randomBytes(32).toString("hex");
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it("fails on tampered ciphertext", () => {
    const encrypted = encrypt("data", TEST_KEY);
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a byte
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe("");
  });

  it("handles unicode", () => {
    const plaintext = "🎵 Spotify tokens: café résumé naïve";
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(decrypt(encrypted, TEST_KEY)).toBe(plaintext);
  });

  it("handles large payloads", () => {
    const plaintext = "x".repeat(100_000);
    const encrypted = encrypt(plaintext, TEST_KEY);
    expect(decrypt(encrypted, TEST_KEY)).toBe(plaintext);
  });
});
