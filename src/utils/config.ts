import { z } from "zod";
import { resolve, join, normalize } from "node:path";

const SPOTIFY_CLIENT_ID_PATTERN = /^[0-9a-fA-F]{32}$/;

const configSchema = z.object({
  SPOTIFY_CLIENT_ID: z
    .string()
    .min(1, "SPOTIFY_CLIENT_ID is required")
    .refine(
      (id) => SPOTIFY_CLIENT_ID_PATTERN.test(id),
      "SPOTIFY_CLIENT_ID must be a 32-character hex string"
    ),
  SPOTIFY_REDIRECT_URI: z
    .string()
    .url()
    .default("http://127.0.0.1:8888/callback")
    .refine(
      (url) => url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:"),
      "Redirect URI must use 127.0.0.1 or localhost for security"
    ),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64, "TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
    .regex(/^[0-9a-fA-F]+$/, "TOKEN_ENCRYPTION_KEY must be hex"),
  TOKEN_STORAGE_PATH: z.string().default("~/.spotify-mcp/tokens.enc"),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration error:\n${issues}`);
  }

  // Expand ~ in TOKEN_STORAGE_PATH using proper path joining
  const home = process.env.HOME || process.env.USERPROFILE;
  if (result.data.TOKEN_STORAGE_PATH.startsWith("~")) {
    if (!home) {
      throw new Error(
        "Cannot expand ~ in TOKEN_STORAGE_PATH: neither HOME nor USERPROFILE is set."
      );
    }
    const relativePart = result.data.TOKEN_STORAGE_PATH.slice(1); // Remove ~
    result.data.TOKEN_STORAGE_PATH = resolve(join(home, relativePart));
  }

  // SECURITY: Validate TOKEN_STORAGE_PATH doesn't traverse outside home directory
  if (home) {
    const normalizedPath = normalize(result.data.TOKEN_STORAGE_PATH);
    const normalizedHome = normalize(home);
    if (!normalizedPath.startsWith(normalizedHome)) {
      throw new Error(
        "TOKEN_STORAGE_PATH must be within the user's home directory for security."
      );
    }
  }

  // Freeze config to prevent runtime mutation
  _config = Object.freeze({ ...result.data }) as Config;
  return _config;
}

/** Reset cached config (for testing) */
export function resetConfig(): void {
  _config = null;
}
