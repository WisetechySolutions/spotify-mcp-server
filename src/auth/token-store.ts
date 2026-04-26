import { readFile, writeFile, mkdir, unlink, chmod, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { encrypt, decrypt } from "../utils/crypto.js";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

const MAX_TOKEN_FILE_SIZE = 10_240;
const MIN_REASONABLE_TIMESTAMP = 0;
const MAX_REASONABLE_TIMESTAMP = 32_503_680_000_000;

/**
 * Hybrid token store. Prefers the OS keyring (Windows DPAPI / macOS Keychain
 * / Linux libsecret) via @napi-rs/keyring; falls back to AES-256-GCM-encrypted
 * file-on-disk when the keyring is unavailable (CI, container without
 * libsecret, tests, etc.).
 *
 * Why prefer keyring: on Windows, NTFS does not honor `chmod 0o600`, and an
 * AES key sitting next to the ciphertext gives only obfuscation. DPAPI binds
 * decryption to the user account — the actual threat boundary on a single-user
 * box. Microsoft's own MSAL.NET uses DPAPI for cache encryption on Windows.
 *
 * Migration: on first load after upgrade, if the keyring is empty AND a
 * legacy encrypted file exists, decrypt with the legacy key, write into the
 * keyring, then delete the file.
 *
 * Vitest escape hatch: when `process.env.VITEST` is set, the keyring path is
 * skipped entirely so existing file-based tests continue to drive the file
 * path deterministically.
 */
export class TokenStore {
  private keyring: { getPassword: () => string | null; setPassword: (v: string) => void; deletePassword: () => boolean } | null = null;
  private keyringTried = false;

  constructor(
    private serviceName: string,
    private storagePath: string,
    private encryptionKey: string,
  ) {}

  private async getKeyring() {
    if (this.keyringTried) return this.keyring;
    this.keyringTried = true;
    if (process.env.VITEST) return null;
    if (process.env.MCP_DISABLE_KEYRING === "1") return null;
    try {
      const mod = await import("@napi-rs/keyring");
      const username = process.env.USERNAME || process.env.USER || "default";
      const entry = new mod.Entry(this.serviceName, username);
      try { entry.getPassword(); } catch { /* may throw "not found" */ }
      this.keyring = entry as unknown as typeof this.keyring;
      return this.keyring;
    } catch {
      return null;
    }
  }

  async load(): Promise<StoredTokens | null> {
    const kr = await this.getKeyring();
    if (kr) {
      let raw: string | null = null;
      try { raw = kr.getPassword(); } catch { /* not-found */ }
      if (raw) {
        try {
          return parseAndValidate(raw);
        } catch (err) {
          // Corrupt keyring blob — JSON parse failure, missing field, prototype-pollution
          // marker, or schema drift. Don't lock the user out forever: log to stderr,
          // fall through to legacy-file then fresh re-auth. The bad blob will get
          // overwritten on the next successful sign-in.
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[mcp][${this.serviceName}] keyring entry unreadable (${msg}); falling back to file/re-auth\n`);
        }
      }

      const legacy = await this.loadLegacyFile();
      if (legacy) {
        try {
          kr.setPassword(JSON.stringify(legacy));
          await this.deleteLegacyFile();
          process.stderr.write(`[mcp][${this.serviceName}] migrated token cache from ${this.storagePath} into OS keyring\n`);
        } catch {
          // Migration write failed — keep file as fallback so user remains signed in.
        }
        return legacy;
      }
      return null;
    }
    return this.loadLegacyFile();
  }

  async save(tokens: StoredTokens): Promise<void> {
    validateTokenStructure(tokens);
    const kr = await this.getKeyring();
    if (kr) {
      try {
        kr.setPassword(JSON.stringify(tokens));
        return;
      } catch {
        // Fall through to file write so we don't lose the cache update.
      }
    }
    await this.saveLegacyFile(tokens);
  }

  async delete(): Promise<void> {
    const kr = await this.getKeyring();
    if (kr) {
      try { kr.deletePassword(); } catch { /* not-found is fine */ }
    }
    await this.deleteLegacyFile();
  }

  async hasValidTokens(): Promise<boolean> {
    const tokens = await this.load();
    if (!tokens) return false;
    const bufferMs = 5 * 60 * 1000;
    return Date.now() < tokens.expiresAt - bufferMs;
  }

  // --- legacy file path (still used in tests, on keyring miss, and for migration) ---

  private async loadLegacyFile(): Promise<StoredTokens | null> {
    try {
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

      return parseAndValidate(json);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return null;
      if (err instanceof Error && (
        err.message.includes("maximum allowed size") ||
        err.message.includes("invalid JSON") ||
        err.message.includes("Invalid token") ||
        err.message.includes("forbidden keys") ||
        err.message.includes("Failed to decrypt")
      )) {
        throw err;
      }
      throw new Error("Failed to load tokens. The token file may be corrupted or the encryption key may have changed.");
    }
  }

  private async saveLegacyFile(tokens: StoredTokens): Promise<void> {
    const dir = dirname(this.storagePath);
    await mkdir(dir, { recursive: true });

    const json = JSON.stringify(tokens);
    const encrypted = encrypt(json, this.encryptionKey);
    await writeFile(this.storagePath, encrypted, { mode: 0o600 });

    try { await chmod(this.storagePath, 0o600); } catch { /* not enforceable on NTFS */ }
  }

  private async deleteLegacyFile(): Promise<void> {
    try {
      await unlink(this.storagePath);
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return;
      throw err;
    }
  }
}

function parseAndValidate(json: string): StoredTokens {
  if (json.includes("__proto__") || json.includes("constructor.prototype")) {
    throw new Error("Token data contains forbidden keys");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Token data contains invalid JSON");
  }
  return validateTokenStructure(parsed);
}

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
