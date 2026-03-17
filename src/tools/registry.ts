import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchTracksSchema,
  createPlaylistSchema,
  addTracksSchema,
  removeTracksSchema,
  getPlaylistSchema,
  getMyPlaylistsSchema,
} from "./schemas.js";
import { searchTracks } from "../spotify/search.js";
import { createPlaylist, getPlaylist, getMyPlaylists } from "../spotify/playlists.js";
import { addTracksToPlaylist, removeTracksFromPlaylist } from "../spotify/playlist-items.js";
import { spotifyErrorToMcp } from "../utils/error-handler.js";
import { deleteTokens } from "../spotify/client.js";

type ToolResult = {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function textResult(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Register all Spotify tools on the MCP server.
 *
 * Each tool is designed to be composable — Claude chains them together
 * to build playlists from its own music knowledge.
 */
export function registerTools(server: McpServer): void {
  // ─── SEARCH ───────────────────────────────────────────────

  server.tool(
    "search_tracks",
    `Search Spotify's catalog for tracks. Use Spotify search syntax for precision:
  - "track:Running Up That Hill artist:Kate Bush"
  - "genre:jazz year:1960-1970"
  - Or just plain text: "songs about rain"
Returns up to 10 results (Dev Mode limit) with URIs for playlist building.`,
    searchTracksSchema.shape,
    async (params, _extra): Promise<ToolResult> => {
      try {
        const result = await searchTracks({
          query: params.query,
          limit: params.limit,
        });

        if (result.tracks.length === 0) {
          return textResult(
            `No tracks found for "${params.query}". Try broadening the search or using different terms.`
          );
        }

        const trackList = result.tracks
          .map(
            (t, i) =>
              `${i + 1}. "${t.name}" by ${t.artists.join(", ")}\n   Album: ${t.album} (${t.releaseDate})\n   URI: ${t.uri}\n   Link: ${t.externalUrl}`
          )
          .join("\n\n");

        return textResult(
          `Found ${result.tracks.length} of ${result.total} total results for "${params.query}":\n\n${trackList}`
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );

  // ─── CREATE PLAYLIST ──────────────────────────────────────

  server.tool(
    "create_playlist",
    `Create a new Spotify playlist. Pick a compelling name and description —
this is the creative touch that makes Claude-curated playlists special.
Returns the playlist ID and URL for adding tracks.`,
    createPlaylistSchema.shape,
    async (params, _extra): Promise<ToolResult> => {
      try {
        const playlist = await createPlaylist({
          name: params.name,
          description: params.description,
          public: params.public,
        });

        return textResult(
          `Playlist created!\n\n` +
            `Name: ${playlist.name}\n` +
            `ID: ${playlist.id}\n` +
            `URL: ${playlist.url}\n` +
            `Public: ${playlist.public}\n` +
            `\nUse add_tracks_to_playlist with this playlist_id to add songs.`
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );

  // ─── ADD TRACKS ───────────────────────────────────────────

  server.tool(
    "add_tracks_to_playlist",
    `Add tracks to a playlist by their Spotify URIs.
Get URIs from search_tracks results. Max 100 tracks per call.
Tracks are appended at the end unless a position is specified.`,
    addTracksSchema.shape,
    async (params, _extra): Promise<ToolResult> => {
      try {
        const result = await addTracksToPlaylist({
          playlistId: params.playlist_id,
          trackUris: params.track_uris,
          position: params.position,
        });

        return textResult(
          `Added ${params.track_uris.length} track(s) to playlist.\nSnapshot ID: ${result.snapshotId}`
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );

  // ─── REMOVE TRACKS ────────────────────────────────────────

  server.tool(
    "remove_tracks_from_playlist",
    `Remove tracks from a playlist by their Spotify URIs.`,
    removeTracksSchema.shape,
    async (params, _extra): Promise<ToolResult> => {
      try {
        const result = await removeTracksFromPlaylist({
          playlistId: params.playlist_id,
          trackUris: params.track_uris,
        });

        return textResult(
          `Removed ${params.track_uris.length} track(s) from playlist.\nSnapshot ID: ${result.snapshotId}`
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );

  // ─── GET PLAYLIST ─────────────────────────────────────────

  server.tool(
    "get_playlist",
    `Get details and full track listing of a playlist.
Useful for analyzing existing playlists before suggesting additions or reorganizing.`,
    getPlaylistSchema.shape,
    async (params, _extra): Promise<ToolResult> => {
      try {
        const playlist = await getPlaylist(params.playlist_id);

        const trackList =
          playlist.tracks.length > 0
            ? playlist.tracks
                .map(
                  (t, i) =>
                    `${i + 1}. "${t.name}" by ${t.artists.join(", ")} [${t.album}]`
                )
                .join("\n")
            : "(empty playlist)";

        return textResult(
          `Playlist: ${playlist.name}\n` +
            `By: ${playlist.owner}\n` +
            `Description: ${playlist.description || "(none)"}\n` +
            `Tracks: ${playlist.trackCount}\n` +
            `URL: ${playlist.url}\n\n` +
            `Track listing:\n${trackList}`
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );

  // ─── GET MY PLAYLISTS ─────────────────────────────────────

  server.tool(
    "get_my_playlists",
    `List the current user's playlists.
Use this to see what playlists already exist before creating new ones,
or to find a playlist to modify.`,
    getMyPlaylistsSchema.shape,
    async (params, _extra): Promise<ToolResult> => {
      try {
        const result = await getMyPlaylists({
          limit: params.limit,
          offset: params.offset,
        });

        if (result.playlists.length === 0) {
          return textResult("No playlists found.");
        }

        const list = result.playlists
          .map(
            (p, i) =>
              `${i + 1 + (params.offset ?? 0)}. "${p.name}" — ${p.trackCount} tracks${p.public ? " (public)" : ""}\n   ID: ${p.id}\n   URL: ${p.url}`
          )
          .join("\n\n");

        return textResult(
          `Your playlists (${result.playlists.length} of ${result.total}):\n\n${list}`
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );

  // ─── DELETE TOKENS ────────────────────────────────────────

  server.tool(
    "disconnect_spotify",
    `Disconnect from Spotify by deleting all stored authentication tokens.
Use this if you want to switch accounts or revoke access.
You will need to re-authorize on the next request.`,
    {},
    async (_params, _extra): Promise<ToolResult> => {
      try {
        await deleteTokens();
        return textResult(
          "Spotify disconnected. All stored tokens have been deleted.\nYou'll need to re-authorize on the next request."
        );
      } catch (error) {
        return spotifyErrorToMcp(error);
      }
    }
  );
}
