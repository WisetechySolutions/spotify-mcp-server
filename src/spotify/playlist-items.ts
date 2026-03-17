import { spotifyFetch } from "./client.js";

/**
 * Add tracks to a playlist.
 *
 * IMPORTANT: Uses /playlists/{id}/items (not /tracks — renamed Feb 2026).
 * Max 100 URIs per request.
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
      new Error(`Failed to add tracks: ${await response.text()}`),
      { status: response.status }
    );
  }

  const data = (await response.json()) as { snapshot_id: string };
  return { snapshotId: data.snapshot_id };
}

/**
 * Remove tracks from a playlist.
 *
 * IMPORTANT: Uses DELETE /playlists/{id}/items (not /tracks — renamed Feb 2026).
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
      new Error(`Failed to remove tracks: ${await response.text()}`),
      { status: response.status }
    );
  }

  const data = (await response.json()) as { snapshot_id: string };
  return { snapshotId: data.snapshot_id };
}

/**
 * Add tracks in batches of 100 (for large playlists).
 * Returns array of snapshot IDs from each batch.
 */
export async function addTracksInBatches(params: {
  playlistId: string;
  trackUris: string[];
}): Promise<string[]> {
  const snapshotIds: string[] = [];
  const batchSize = 100;

  for (let i = 0; i < params.trackUris.length; i += batchSize) {
    const batch = params.trackUris.slice(i, i + batchSize);
    const result = await addTracksToPlaylist({
      playlistId: params.playlistId,
      trackUris: batch,
    });
    snapshotIds.push(result.snapshotId);
  }

  return snapshotIds;
}
