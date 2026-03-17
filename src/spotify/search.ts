import { spotifyFetch } from "./client.js";

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
 */
export async function searchTracks(params: {
  query: string;
  limit?: number;
}): Promise<SearchResult> {
  const limit = Math.min(params.limit ?? 10, 10); // Dev Mode cap: 10

  const searchParams = new URLSearchParams({
    q: params.query,
    type: "track",
    limit: limit.toString(),
  });

  const response = await spotifyFetch(`/search?${searchParams.toString()}`);

  if (!response.ok) {
    throw Object.assign(new Error(`Search failed (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await response.json()) as SpotifySearchResponse;

  const tracks: TrackResult[] = (data.tracks?.items ?? []).map((item) => ({
    uri: item.uri,
    name: item.name,
    artists: item.artists.map((a) => a.name),
    album: item.album.name,
    releaseDate: item.album.release_date,
    durationMs: item.duration_ms,
    previewUrl: item.preview_url,
    externalUrl: item.external_urls?.spotify ?? "",
  }));

  return {
    tracks,
    query: params.query,
    total: data.tracks?.total ?? 0,
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
