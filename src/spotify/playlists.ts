import { spotifyFetch } from "./client.js";

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

  const data = (await response.json()) as SpotifyPaginatedPlaylists;

  return {
    playlists: data.items.map(mapPlaylistSummary),
    total: data.total,
  };
}

/**
 * Get a single playlist by ID, including its tracks.
 */
export async function getPlaylist(playlistId: string): Promise<PlaylistDetail> {
  const response = await spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}`);
  if (!response.ok) {
    throw Object.assign(new Error(`Failed to get playlist (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await response.json()) as SpotifyFullPlaylist;

  return {
    ...mapPlaylistSummary(data),
    tracks: (data.tracks?.items ?? []).map((item) => ({
      uri: item.track?.uri ?? "",
      name: item.track?.name ?? "",
      artists: (item.track?.artists ?? []).map((a) => a.name),
      album: item.track?.album?.name ?? "",
      addedAt: item.added_at ?? "",
      durationMs: item.track?.duration_ms ?? 0,
    })),
    owner: data.owner?.display_name ?? "",
  };
}

/**
 * Create a new playlist for the current user.
 */
export async function createPlaylist(params: {
  name: string;
  description?: string;
  public?: boolean;
}): Promise<PlaylistSummary> {
  // Use /me/playlists — /users/{id}/playlists returns 403 in Dev Mode (Feb 2026)
  const response = await spotifyFetch("/me/playlists", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      description: params.description ?? "",
      public: params.public ?? false,
    }),
  });

  if (!response.ok) {
    throw Object.assign(new Error(`Failed to create playlist (HTTP ${response.status}).`), {
      status: response.status,
    });
  }

  const data = (await response.json()) as SpotifyPlaylistObject;
  return mapPlaylistSummary(data);
}

function mapPlaylistSummary(p: SpotifyPlaylistObject): PlaylistSummary {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    trackCount: p.tracks?.total ?? 0,
    public: p.public ?? false,
    url: p.external_urls?.spotify ?? "",
    imageUrl: p.images?.[0]?.url ?? null,
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
