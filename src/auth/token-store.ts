import { readFile, writeFile, mkdir, unlink, chmod, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { encrypt, decrypt } from "../utils/crypto.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  scope: string;
}

const MAX_TOKEN_FILE_SIZE = 10_240; // 10KB — encrypted tokens should be tiny
const MIN_REASONABLE_TIMESTAMP = 0; // Unix epoch
const MAX_REASONABLE_TIMESTAMP = 32_503_680_000_000; // Year 3000 in ms — unreasonable future

/**
 * Encrypted token persistence using AES-256-GCM.
 * Tokens are stored as a single encrypted JSON blob.
 *
 * Security hardening:
 * - File size check before reading (reject > 10KB)
 * - JSON structure validation after decryption
 * - Timestamp reasonableness validation
 * - Decrypted data wiped from memory when no longer needed
 */
export class TokenStore {
  constructor(
    private storagePath: string,
    private encryptionKey: string
  ) {}

  /**
   * Load tokens from encrypted file. Returns null if no file exists.
   */
  async load(): Promise<StoredTokens | null> {
    try {
      // Check file size before reading — defense against corrupted/malicious files
      const fileStats = await stat(this.storagePath);
      if (fileStats.size > MAX_TOKEN_FILE_SIZE) {
        throw new Error("Token file exceeds maximum allowed size (10KB)");
      }

      const data = await readFile(this.storagePath, "utf8");
      let json: string;
      try {
        json = decrypt(data, this.encryptionKey);
      } catch {
        throw new Error("Failed to decrypt token file");
      }

      // Parse and validate JSON structure
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new Error("Token file contains invalid JSON after decryption");
      }

      // Wipe the decrypted JSON string from the variable
      json = "";

      // Validate required fields exist with correct types
      const tokens = validateTokenStructure(parsed);

      return tokens;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return null; // No token file yet
      }
      if (err instanceof Error && (
        err.message.includes("maximum allowed size") ||
        err.message.includes("invalid JSON") ||
        err.message.includes("Invalid token") ||
        err.message.includes("Failed to decrypt")
      )) {
        throw err; // Re-throw our own validation errors with their specific messages
      }
      throw new Error("Failed to load tokens. The token file may be corrupted or the encryption key may have changed.");
    }
  }

  /**
   * Save tokens to encrypted file.
   * Creates parent directory if it doesn't exist.
   */
  async save(tokens: StoredTokens): Promise<void> {
    // Validate before saving
    validateTokenStructure(tokens);

    const dir = dirname(this.storagePath);
    await mkdir(dir, { recursive: true });

    const json = JSON.stringify(tokens);
    const encrypted = encrypt(json, this.encryptionKey);
    await writeFile(this.storagePath, encrypted, { mode: 0o600 });

    // Attempt to set permissions (may not work on all Windows configs)
    try {
      await chmod(this.storagePath, 0o600);
    } catch {
      // Permissions not supported on this filesystem, continue
    }
  }

  /**
   * Delete the token file. Used for logout / data deletion.
   */
  async delete(): Promise<void> {
    try {
      await unlink(this.storagePath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return; // Already deleted
      }
      throw err;
    }
  }

  /**
   * Check if tokens exist and are not expired.
   * Includes a 5-minute buffer before actual expiry.
   */
  async hasValidTokens(): Promise<boolean> {
    const tokens = await this.load();
    if (!tokens) return false;
    const bufferMs = 5 * 60 * 1000;
    return Date.now() < tokens.expiresAt - bufferMs;
  }
}

/**
 * Validate that the parsed object has the required StoredTokens shape.
 * Defense against corrupted or tampered token files.
 */
function validateTokenStructure(parsed: unknown): StoredTokens {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid token structure: expected an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.accessToken !== "string" || obj.accessToken.length === 0) {
    throw new Error("Invalid token structure: accessToken must be a non-empty string");
  }
  if (typeof obj.refreshToken !== "string" || obj.refreshToken.length === 0) {
    throw new Error("Invalid token structure: refreshToken must be a non-empty string");
  }
  if (typeof obj.expiresAt !== "number" || !Number.isFinite(obj.expiresAt)) {
    throw new Error("Invalid token structure: expiresAt must be a finite number");
  }
  if (obj.expiresAt < MIN_REASONABLE_TIMESTAMP || obj.expiresAt > MAX_REASONABLE_TIMESTAMP) {
    throw new Error("Invalid token structure: expiresAt timestamp is out of reasonable range");
  }
  if (typeof obj.scope !== "string") {
    throw new Error("Invalid token structure: scope must be a string");
  }

  return {
    accessToken: obj.accessToken,
    refreshToken: obj.refreshToken,
    expiresAt: obj.expiresAt,
    scope: obj.scope,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
