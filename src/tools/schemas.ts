import { z } from "zod";

/**
 * Zod schemas for all MCP tool inputs.
 * These define what Claude sends when it calls each tool.
 *
 * Security: All string inputs reject null bytes and control characters.
 */

/** Reject null bytes and control characters in strings (defense-in-depth) */
const safeString = (schema: z.ZodString) =>
  schema.refine(
    (s) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s),
    "Input contains invalid control characters"
  );

export const searchTracksSchema = z.object({
  query: safeString(
    z
      .string()
      .min(1)
      .max(500)
  ).describe(
    "Search query (max 500 chars). Supports Spotify syntax: 'track:Name artist:Artist', 'genre:rock year:2020-2025', or plain text."
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(10)
    .describe("Max results (1-10, Dev Mode cap)."),
});

export const createPlaylistSchema = z.object({
  name: safeString(
    z
      .string()
      .min(1)
      .max(100)
  ).describe("Playlist name (max 100 chars). Be creative — this is the first thing people see."),
  description: safeString(
    z
      .string()
      .max(300)
  )
    .optional()
    .describe("Playlist description (max 300 chars). Explain the theme, vibe, or story."),
  public: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the playlist is publicly visible."),
});

export const addTracksSchema = z.object({
  playlist_id: safeString(
    z
      .string()
      .regex(/^[a-zA-Z0-9]{22}$/, "Must be a valid 22-character Spotify playlist ID")
  ).describe("Spotify playlist ID."),
  track_uris: z
    .array(
      safeString(
        z.string().regex(/^spotify:track:[a-zA-Z0-9]+$/, "Must be a Spotify track URI")
      )
    )
    .min(1)
    .max(100)
    .describe("Array of Spotify track URIs (e.g., 'spotify:track:6rqhFgbbKwnb9MLmUQDhG6'). Max 100."),
  position: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Position to insert tracks. 0 = beginning. Omit to append at end."),
});

export const removeTracksSchema = z.object({
  playlist_id: safeString(
    z
      .string()
      .regex(/^[a-zA-Z0-9]{22}$/, "Must be a valid 22-character Spotify playlist ID")
  ).describe("Spotify playlist ID."),
  track_uris: z
    .array(
      safeString(
        z.string().regex(/^spotify:track:[a-zA-Z0-9]+$/, "Must be a Spotify track URI")
      )
    )
    .min(1)
    .max(100)
    .describe("Array of Spotify track URIs to remove. Max 100."),
});

export const getPlaylistSchema = z.object({
  playlist_id: safeString(
    z
      .string()
      .regex(/^[a-zA-Z0-9]{22}$/, "Must be a valid 22-character Spotify playlist ID")
  ).describe("Spotify playlist ID."),
});

export const getMyPlaylistsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe("Max playlists to return (1-50)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Offset for pagination."),
});
