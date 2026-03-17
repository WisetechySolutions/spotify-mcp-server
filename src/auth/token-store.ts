import { readFile, writeFile, mkdir, unlink, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { encrypt, decrypt } from "../utils/crypto.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  scope: string;
}

/**
 * Encrypted token persistence using AES-256-GCM.
 * Tokens are stored as a single encrypted JSON blob.
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
      const data = await readFile(this.storagePath, "utf8");
      const json = decrypt(data, this.encryptionKey);
      return JSON.parse(json) as StoredTokens;
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return null; // No token file yet
      }
      throw new Error(`Failed to load tokens: ${(err as Error).message}`);
    }
  }

  /**
   * Save tokens to encrypted file.
   * Creates parent directory if it doesn't exist.
   */
  async save(tokens: StoredTokens): Promise<void> {
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

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
