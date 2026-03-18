import { spotifyFetch, sanitizeQueryParam, safeParseJsonResponse } from "./client.js";

export interface TrackResult {
  uri: string;
  name: string;
  artists: string[];
  album: string;
  releaseDate: string;
  durationMs: number;
  previewUrl: string | null;
  externalUrl: string;
}

export interface SearchResult {
  tracks: TrackResult[];
  query: string;
  total: number;
}

/**
 * Search for tracks on Spotify.
 *
 * Note: Dev Mode limits results to max 10.
 * The query supports Spotify search syntax:
 *   - "track:Song Name artist:Artist Name"
 *   - "genre:rock year:2020-2025"
 *
 * Security: Query is sanitized before use in API parameters.
 * Response structure is validated before accessing properties.
 */
export async function searchTracks(params: {
  query: string;
  limit?: number;
}): Promise<SearchResult> {
  const limit = Math.min(params.limit ?? 10, 10); // Dev Mode cap: 10

  // Sanitize user input before using in query parameters
  const sanitizedQuery = sanitizeQueryParam(params.query);

  const searchParams = new URLSearchParams({
    q: sanitizedQuery,
    type: "track",
    limit: limit.toString(),
  });

  const response = await spotifyFetch(`/search?${searchParams.toString()}`);

  if (!response.ok) {
    // Never pass raw Spotify error details to the user
    throw Object.assign(new Error(`Search failed (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await safeParseJsonResponse(response)) as SpotifySearchResponse;

  // Validate response structure before accessing properties
  if (data && typeof data === "object" && data.tracks && Array.isArray(data.tracks.items)) {
    const tracks: TrackResult[] = data.tracks.items
      .filter((item): item is SpotifyTrackObject =>
        item != null && typeof item === "object" && typeof item.uri === "string"
      )
      .map((item) => ({
        uri: String(item.uri ?? ""),
        name: String(item.name ?? ""),
        artists: Array.isArray(item.artists)
          ? item.artists.map((a) => String(a?.name ?? ""))
          : [],
        album: String(item.album?.name ?? ""),
        releaseDate: String(item.album?.release_date ?? ""),
        durationMs: typeof item.duration_ms === "number" ? item.duration_ms : 0,
        previewUrl: typeof item.preview_url === "string" ? item.preview_url : null,
        externalUrl: String(item.external_urls?.spotify ?? ""),
      }));

    return {
      tracks,
      query: params.query,
      total: typeof data.tracks.total === "number" ? data.tracks.total : 0,
    };
  }

  // Response didn't match expected structure — return empty results safely
  return {
    tracks: [],
    query: params.query,
    total: 0,
  };
}

// Spotify API response types (minimal — only what we use)
interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrackObject[];
    total: number;
  };
}

interface SpotifyTrackObject {
  uri: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    release_date: string;
  };
  duration_ms: number;
  preview_url: string | null;
  external_urls?: { spotify: string };
}
