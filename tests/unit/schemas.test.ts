import { describe, it, expect } from "vitest";
import {
  searchTracksSchema,
  createPlaylistSchema,
  addTracksSchema,
  removeTracksSchema,
  getPlaylistSchema,
  getMyPlaylistsSchema,
} from "../../src/tools/schemas.js";

describe("schemas", () => {
  describe("searchTracksSchema", () => {
    it("accepts valid query", () => {
      const result = searchTracksSchema.safeParse({ query: "Kate Bush" });
      expect(result.success).toBe(true);
    });

    it("rejects empty query", () => {
      const result = searchTracksSchema.safeParse({ query: "" });
      expect(result.success).toBe(false);
    });

    it("defaults limit to 10", () => {
      const result = searchTracksSchema.parse({ query: "test" });
      expect(result.limit).toBe(10);
    });

    it("rejects limit > 10", () => {
      const result = searchTracksSchema.safeParse({ query: "test", limit: 50 });
      expect(result.success).toBe(false);
    });

    it("rejects limit < 1", () => {
      const result = searchTracksSchema.safeParse({ query: "test", limit: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe("createPlaylistSchema", () => {
    it("accepts valid name", () => {
      const result = createPlaylistSchema.safeParse({ name: "My Playlist" });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createPlaylistSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects name > 100 chars", () => {
      const result = createPlaylistSchema.safeParse({ name: "x".repeat(101) });
      expect(result.success).toBe(false);
    });

    it("defaults public to false", () => {
      const result = createPlaylistSchema.parse({ name: "test" });
      expect(result.public).toBe(false);
    });

    it("rejects description > 300 chars", () => {
      const result = createPlaylistSchema.safeParse({
        name: "test",
        description: "x".repeat(301),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("addTracksSchema", () => {
    const validUri = "spotify:track:6rqhFgbbKwnb9MLmUQDhG6";

    it("accepts valid input", () => {
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: [validUri],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty track_uris", () => {
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects > 100 track URIs", () => {
      const uris = Array(101).fill(validUri);
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: uris,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid URI format", () => {
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: ["not-a-spotify-uri"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects URI with injection attempt", () => {
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: ["spotify:track:abc\n../../etc"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects URI with special characters", () => {
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: ["spotify:track:abc<script>"],
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional position", () => {
      const result = addTracksSchema.parse({
        playlist_id: "abc123",
        track_uris: [validUri],
        position: 0,
      });
      expect(result.position).toBe(0);
    });

    it("rejects negative position", () => {
      const result = addTracksSchema.safeParse({
        playlist_id: "abc123",
        track_uris: [validUri],
        position: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("removeTracksSchema", () => {
    it("accepts valid input", () => {
      const result = removeTracksSchema.safeParse({
        playlist_id: "abc",
        track_uris: ["spotify:track:abc123"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty URIs", () => {
      const result = removeTracksSchema.safeParse({
        playlist_id: "abc",
        track_uris: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getPlaylistSchema", () => {
    it("accepts valid playlist_id", () => {
      const result = getPlaylistSchema.safeParse({ playlist_id: "abc123" });
      expect(result.success).toBe(true);
    });

    it("rejects empty playlist_id", () => {
      const result = getPlaylistSchema.safeParse({ playlist_id: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("getMyPlaylistsSchema", () => {
    it("provides defaults", () => {
      const result = getMyPlaylistsSchema.parse({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it("rejects limit > 50", () => {
      const result = getMyPlaylistsSchema.safeParse({ limit: 100 });
      expect(result.success).toBe(false);
    });

    it("rejects negative offset", () => {
      const result = getMyPlaylistsSchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });
  });
});
