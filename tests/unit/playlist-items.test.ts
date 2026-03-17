import { describe, it, expect } from "vitest";
import { addTracksToPlaylist, removeTracksFromPlaylist } from "../../src/spotify/playlist-items.js";

describe("playlist-items validation", () => {
  describe("addTracksToPlaylist", () => {
    it("throws on empty URIs", async () => {
      await expect(
        addTracksToPlaylist({ playlistId: "abc", trackUris: [] })
      ).rejects.toThrow("No track URIs provided");
    });

    it("throws on > 100 URIs", async () => {
      const uris = Array(101).fill("spotify:track:abc");
      await expect(
        addTracksToPlaylist({ playlistId: "abc", trackUris: uris })
      ).rejects.toThrow("Maximum 100 tracks");
    });
  });

  describe("removeTracksFromPlaylist", () => {
    it("throws on empty URIs", async () => {
      await expect(
        removeTracksFromPlaylist({ playlistId: "abc", trackUris: [] })
      ).rejects.toThrow("No track URIs provided");
    });
  });
});
