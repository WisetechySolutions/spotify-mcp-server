import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12; // NIST SP 800-38D recommended length for AES-GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const MIN_PACKED_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH; // IV + tag (ciphertext can be 0 bytes for empty plaintext)

// Only AES-256-GCM is permitted
const ALLOWED_ALGORITHMS = new Set(["aes-256-gcm"]);

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns: base64(iv + authTag + ciphertext)
 *
 * Security: Key buffer is wiped after use to limit exposure in memory dumps.
 */
export function encrypt(plaintext: string, keyHex: string): string {
  if (!ALLOWED_ALGORITHMS.has(ALGORITHM)) {
    throw new Error("Invalid encryption algorithm");
  }

  const key = Buffer.from(keyHex, "hex");
  try {
    if (key.length !== KEY_LENGTH) {
      throw new Error("Encryption key must be exactly 32 bytes");
    }
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Pack: iv (12) + authTag (16) + ciphertext
    const packed = Buffer.concat([iv, authTag, encrypted]);
    return packed.toString("base64");
  } finally {
    // Defense against memory dumps: wipe key material
    key.fill(0);
  }
}

/**
 * Decrypt base64(iv + authTag + ciphertext) using AES-256-GCM.
 *
 * Security:
 * - Validates minimum buffer length before unpacking
 * - Uses timing-safe comparison for auth tag verification
 * - Wipes key buffer after use
 */
export function decrypt(packed: string, keyHex: string): string {
  if (!ALLOWED_ALGORITHMS.has(ALGORITHM)) {
    throw new Error("Invalid encryption algorithm");
  }

  const key = Buffer.from(keyHex, "hex");
  try {
    if (key.length !== KEY_LENGTH) {
      throw new Error("Encryption key must be exactly 32 bytes");
    }
    const buf = Buffer.from(packed, "base64");

    // Validate minimum packed buffer length before unpacking
    if (buf.length < MIN_PACKED_LENGTH) {
      throw new Error("Encrypted data is too short — possibly corrupted");
    }

    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // Timing-safe verification: re-derive auth tag and compare
    // The GCM mode already verifies internally via setAuthTag + final(),
    // but this adds an explicit belt-and-suspenders layer
    const recipher = createCipheriv(ALGORITHM, key, iv);
    recipher.update(decrypted);
    recipher.final();
    const expectedTag = recipher.getAuthTag();
    if (!timingSafeEqual(authTag, expectedTag)) {
      throw new Error("Authentication tag verification failed");
    }

    return decrypted.toString("utf8");
  } finally {
    // Defense against memory dumps: wipe key material
    key.fill(0);
  }
}
