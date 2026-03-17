import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register creative playlist prompts.
 *
 * These are pre-built workflows that guide Claude to use its deep music
 * knowledge to curate playlists. The prompts tell Claude HOW to think
 * about music selection — the Spotify tools are just the hands.
 */
export function registerPrompts(server: McpServer): void {
  // ─── MOOD PLAYLIST ────────────────────────────────────────

  server.prompt(
    "create_mood_playlist",
    `Create a Spotify playlist for a specific mood or feeling.
Claude uses its music knowledge to pick songs that capture the exact emotional texture requested.`,
    { mood: z.string().describe("The mood or feeling (e.g., 'melancholic but hopeful', 'chaotic energy', 'Sunday morning slow')") },
    (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a Spotify playlist that captures this mood: "${params.mood}"

Instructions:
1. Think deeply about what this mood SOUNDS like — tempo, instrumentation, vocal quality, lyrical themes.
2. Draw from your knowledge of music across all genres and eras. Don't default to the obvious. Mix well-known tracks with deeper cuts.
3. Aim for 15-20 songs that create a cohesive emotional arc. Order matters — think about the flow from track to track.
4. Come up with a creative, evocative playlist name (not just the mood word).
5. Write a short, poetic description.
6. Search for each song on Spotify using search_tracks.
7. Create the playlist with create_playlist.
8. Add all found tracks with add_tracks_to_playlist.
9. Report which songs you couldn't find, and suggest alternatives.

Remember: Your music knowledge is the value here. Don't just pick the first search result — pick the RIGHT song.`,
          },
        },
      ],
    })
  );

  // ─── THEMATIC PLAYLIST ────────────────────────────────────

  server.prompt(
    "create_thematic_playlist",
    `Create a playlist around a literary, conceptual, or metaphorical theme.
This is where Claude shines — making connections no algorithm can.`,
    { theme: z.string().describe("The theme (e.g., 'songs referencing Greek mythology', 'songs where the narrator is unreliable', 'the color blue as a metaphor')") },
    (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a Spotify playlist around this theme: "${params.theme}"

Instructions:
1. This is a THEMATIC playlist — songs should connect to the theme through lyrics, titles, artist intent, cultural context, or musical metaphor. Not just keyword matching.
2. Think laterally. If the theme is "Sisyphus," don't just find songs with "Sisyphus" in the title. Find songs about futile struggle, endless repetition, finding meaning in the attempt, pushing against impossible odds.
3. Explain the connection for each song — why does it belong? This is part of the value.
4. Span genres and eras. A great thematic playlist surprises the listener.
5. 15-25 songs. Order them to tell a story or create a narrative arc.
6. Creative playlist name that captures the theme without being literal.
7. Write a description that would make someone want to press play.
8. Search, create, and populate the playlist using the Spotify tools.
9. For songs not found, suggest alternatives and explain the swap.

Your deep knowledge of music, literature, and culture is what makes this impossible to replicate with any algorithm.`,
          },
        },
      ],
    })
  );

  // ─── DISCOVER SIMILAR ─────────────────────────────────────

  server.prompt(
    "discover_similar",
    `Given seed songs or artists, discover similar music using Claude's taste graph (not Spotify's algorithm).`,
    { seeds: z.string().describe("Seed songs or artists (e.g., 'Radiohead - Everything In Its Right Place, Boards of Canada - Dayvan Cowboy')") },
    (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I love these songs/artists: ${params.seeds}

Create a Spotify playlist of discoveries based on my taste.

Instructions:
1. Analyze what connects these seeds — don't just match genre. Think about: production style, emotional register, harmonic complexity, rhythmic feel, lyrical worldview, cultural lineage.
2. Find songs that share these DEEPER qualities, not just surface similarity.
3. Include a mix of:
   - Songs I probably know but haven't connected to these seeds
   - Songs I might not know from well-known artists
   - Hidden gems from lesser-known artists
   - At least 2-3 songs from completely unexpected genres that somehow fit
4. 20-25 songs. Order for flow and discovery — put the unexpected ones where they'll land best.
5. Name the playlist something that captures the shared DNA of the seeds.
6. In the description, explain the thread that connects everything.
7. Search and build the playlist using the Spotify tools.

Your recommendations should feel like getting a mix tape from the most musically knowledgeable friend imaginable.`,
          },
        },
      ],
    })
  );

  // ─── NARRATIVE ARC ────────────────────────────────────────

  server.prompt(
    "create_narrative_playlist",
    `Create a playlist that tells a story — with a beginning, middle, and end.`,
    { narrative: z.string().describe("The story arc (e.g., 'falling in love in a city that's falling apart', 'a road trip from hope to disillusionment to acceptance')") },
    (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a Spotify playlist that tells this story: "${params.narrative}"

Instructions:
1. Think of this as a SOUNDTRACK. Each song is a scene. The playlist is the movie.
2. Structure it in acts:
   - Act 1 (songs 1-5): Establish the world and the emotional starting point
   - Act 2 (songs 6-12): Build tension, develop the core conflict/journey
   - Act 3 (songs 13-18): Climax and resolution
   - Epilogue (songs 19-20): The emotional landing — how does the listener leave?
3. Transitions matter. The end of one song should feel like it leads into the next.
4. Vary energy, tempo, and intensity to create dynamics. Don't just ramp up linearly.
5. The playlist name should feel like a film title.
6. The description should read like a one-paragraph synopsis.
7. Search and build using Spotify tools.

Think of yourself as a film composer picking songs for a soundtrack, not a DJ making a mix.`,
          },
        },
      ],
    })
  );

  // ─── ERA BLEND ────────────────────────────────────────────

  server.prompt(
    "create_era_blend",
    `Blend two musical eras or genres that shouldn't work together — but do.`,
    {
      era_one: z.string().describe("First era/genre (e.g., '1960s Motown')"),
      era_two: z.string().describe("Second era/genre (e.g., '2020s hyperpop')"),
    },
    (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a playlist that blends "${params.era_one}" with "${params.era_two}".

Instructions:
1. Find the unexpected common ground between these two worlds. What production techniques, emotional themes, or musical ideas bridge them?
2. Structure the playlist as a journey FROM one era/genre TO the other, with songs in the middle that genuinely live in both worlds.
3. Include:
   - Pure examples from era/genre one (the starting point)
   - Songs that subtly bridge toward the other
   - Songs that genuinely exist at the intersection
   - Songs that bridge from the intersection toward the other end
   - Pure examples from era/genre two (the destination)
4. 18-22 songs. The listener should barely notice the transition happening.
5. Name it something that captures the collision.
6. Description should explain why this blend actually works.
7. Search and build using Spotify tools.

The goal: make someone say "I never would have thought to put these together, but now I can't unhear the connection."`,
          },
        },
      ],
    })
  );
}
