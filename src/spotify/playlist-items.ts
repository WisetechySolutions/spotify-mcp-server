import { spotifyFetch } from "./client.js";

/**
 * Add tracks to a playlist.
 *
 * IMPORTANT: Uses /playlists/{id}/items (not /tracks — renamed Feb 2026).
 * Max 100 URIs per request.
 *
 * Security: Playlist ID is URI-encoded. Response structure validated.
 * Error messages never expose raw Spotify API details.
 */
export async function addTracksToPlaylist(params: {
  playlistId: string;
  trackUris: string[];
  position?: number;
}): Promise<{ snapshotId: string }> {
  if (params.trackUris.length === 0) {
    throw new Error("No track URIs provided.");
  }
  if (params.trackUris.length > 100) {
    throw new Error("Maximum 100 tracks per request. Split into batches.");
  }

  const body: Record<string, unknown> = {
    uris: params.trackUris,
  };
  if (params.position !== undefined) {
    body.position = params.position;
  }

  const response = await spotifyFetch(
    `/playlists/${encodeURIComponent(params.playlistId)}/items`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    throw Object.assign(
      new Error(`Failed to add tracks (HTTP ${response.status}).`),
      { status: response.status }
    );
  }

  const data = (await response.json()) as { snapshot_id: string };

  // Validate response structure
  if (!data || typeof data !== "object" || typeof data.snapshot_id !== "string") {
    throw Object.assign(
      new Error("Spotify returned an invalid response when adding tracks."),
      { status: 502 }
    );
  }

  return { snapshotId: data.snapshot_id };
}

/**
 * Remove tracks from a playlist.
 *
 * IMPORTANT: Uses DELETE /playlists/{id}/items (not /tracks — renamed Feb 2026).
 *
 * Security: Playlist ID is URI-encoded. Response structure validated.
 */
export async function removeTracksFromPlaylist(params: {
  playlistId: string;
  trackUris: string[];
}): Promise<{ snapshotId: string }> {
  if (params.trackUris.length === 0) {
    throw new Error("No track URIs provided.");
  }

  const response = await spotifyFetch(
    `/playlists/${encodeURIComponent(params.playlistId)}/items`,
    {
      method: "DELETE",
      body: JSON.stringify({
        tracks: params.trackUris.map((uri) => ({ uri })),
      }),
    }
  );

  if (!response.ok) {
    throw Object.assign(
      new Error(`Failed to remove tracks (HTTP ${response.status}).`),
      { status: response.status }
    );
  }

  const data = (await response.json()) as { snapshot_id: string };

  // Validate response structure
  if (!data || typeof data !== "object" || typeof data.snapshot_id !== "string") {
    throw Object.assign(
      new Error("Spotify returned an invalid response when removing tracks."),
      { status: 502 }
    );
  }

  return { snapshotId: data.snapshot_id };
}

