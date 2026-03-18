import { spotifyFetch, sanitizeQueryParam, safeParseJsonResponse } from "./client.js";

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  trackCount: number;
  public: boolean;
  url: string;
  imageUrl: string | null;
}

export interface PlaylistDetail extends PlaylistSummary {
  tracks: PlaylistTrack[];
  owner: string;
}

export interface PlaylistTrack {
  uri: string;
  name: string;
  artists: string[];
  album: string;
  addedAt: string;
  durationMs: number;
}

/**
 * Get the current user's playlists.
 *
 * Security: Response structure validated before accessing properties.
 * Error messages never expose raw Spotify API details.
 */
export async function getMyPlaylists(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ playlists: PlaylistSummary[]; total: number }> {
  const searchParams = new URLSearchParams({
    limit: String(params?.limit ?? 20),
    offset: String(params?.offset ?? 0),
  });

  const response = await spotifyFetch(`/me/playlists?${searchParams}`);
  if (!response.ok) {
    throw Object.assign(new Error(`Failed to get playlists (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await safeParseJsonResponse(response)) as SpotifyPaginatedPlaylists;

  // Validate response structure
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
    return { playlists: [], total: 0 };
  }

  return {
    playlists: data.items
      .filter((item): item is SpotifyPlaylistObject => item != null && typeof item === "object" && typeof item.id === "string")
      .map(mapPlaylistSummary),
    total: typeof data.total === "number" ? data.total : 0,
  };
}

/**
 * Get a single playlist by ID, including its tracks.
 *
 * Security: Playlist ID is URI-encoded. Response structure validated.
 */
export async function getPlaylist(playlistId: string): Promise<PlaylistDetail> {
  const response = await spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}`);
  if (!response.ok) {
    throw Object.assign(new Error(`Failed to get playlist (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await safeParseJsonResponse(response)) as SpotifyFullPlaylist;

  // Validate response structure
  if (!data || typeof data !== "object" || typeof data.id !== "string") {
    throw Object.assign(new Error("Spotify returned an invalid playlist response."), {
      status: 502,
    });
  }

  return {
    ...mapPlaylistSummary(data),
    tracks: (Array.isArray(data.tracks?.items) ? data.tracks!.items : [])
      .filter((item): item is SpotifyPlaylistTrackItem => item != null && typeof item === "object")
      .map((item) => ({
        uri: String(item.track?.uri ?? ""),
        name: String(item.track?.name ?? ""),
        artists: Array.isArray(item.track?.artists)
          ? item.track!.artists.map((a) => String(a?.name ?? ""))
          : [],
        album: String(item.track?.album?.name ?? ""),
        addedAt: String(item.added_at ?? ""),
        durationMs: typeof item.track?.duration_ms === "number" ? item.track.duration_ms : 0,
      })),
    owner: String(data.owner?.display_name ?? ""),
  };
}

/**
 * Create a new playlist for the current user.
 *
 * Security: User-provided name/description are sanitized before sending.
 */
export async function createPlaylist(params: {
  name: string;
  description?: string;
  public?: boolean;
}): Promise<PlaylistSummary> {
  // Sanitize user-provided text values
  const sanitizedName = sanitizeQueryParam(params.name);
  const sanitizedDescription = sanitizeQueryParam(params.description ?? "");

  // Use /me/playlists — /users/{id}/playlists returns 403 in Dev Mode (Feb 2026)
  const response = await spotifyFetch("/me/playlists", {
    method: "POST",
    body: JSON.stringify({
      name: sanitizedName,
      description: sanitizedDescription,
      public: params.public ?? false,
    }),
  });

  if (!response.ok) {
    throw Object.assign(new Error(`Failed to create playlist (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await safeParseJsonResponse(response)) as SpotifyPlaylistObject;

  // Validate response structure
  if (!data || typeof data !== "object" || typeof data.id !== "string") {
    throw Object.assign(new Error("Spotify returned an invalid playlist response."), {
      status: 502,
    });
  }

  return mapPlaylistSummary(data);
}

function mapPlaylistSummary(p: SpotifyPlaylistObject): PlaylistSummary {
  return {
    id: String(p.id ?? ""),
    name: String(p.name ?? ""),
    description: String(p.description ?? ""),
    trackCount: typeof p.tracks?.total === "number" ? p.tracks.total : 0,
    public: typeof p.public === "boolean" ? p.public : false,
    url: String(p.external_urls?.spotify ?? ""),
    imageUrl: typeof p.images?.[0]?.url === "string" ? p.images[0].url : null,
  };
}

// Spotify API response types (minimal)
interface SpotifyPlaylistObject {
  id: string;
  name: string;
  description?: string;
  public?: boolean;
  external_urls?: { spotify: string };
  images?: Array<{ url: string }>;
  tracks?: { total: number; items?: SpotifyPlaylistTrackItem[] };
  owner?: { display_name: string };
}

interface SpotifyPlaylistTrackItem {
  added_at?: string;
  track?: {
    uri: string;
    name: string;
    artists: Array<{ name: string }>;
    album?: { name: string };
    duration_ms: number;
  };
}

interface SpotifyFullPlaylist extends SpotifyPlaylistObject {
  tracks?: {
    total: number;
    items: SpotifyPlaylistTrackItem[];
  };
}

interface SpotifyPaginatedPlaylists {
  items: SpotifyPlaylistObject[];
  total: number;
}
