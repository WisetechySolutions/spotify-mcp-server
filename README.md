# Spotify MCP Server for Claude

> "Make me a playlist of songs about pushing boulders uphill — Sisyphus vibes, futile struggle turned beautiful."
>
> Claude thinks, searches, creates. You get "The Beautiful Futility" — 20 tracks spanning Kate Bush to Andrew Bird, perfectly ordered.

An [MCP](https://modelcontextprotocol.io) server that turns Claude into the world's most creative DJ. Claude brings deep music knowledge — genres, themes, lyrics, cultural connections, obscure references. Spotify brings 100M+ tracks. This server is the bridge.

**What makes this different from Spotify's own recommendations?** Claude can handle requests no algorithm can:
- "Songs referencing Greek mythology"
- "Songs where the narrator is talking to their past self"
- "A playlist that tells the story of a relationship from first date to breakup"
- "Jazz-to-electronic pipeline — start mellow, end cosmic"
- "Songs two rivals would play at each other in a musical argument"

Data from Spotify. Taste from Claude.

---

## Quick Start

### Prerequisites
- **Node.js 18+** — [Download](https://nodejs.org)
- **Spotify Premium** — Required for Dev Mode API access
- **Claude Code** or **Claude Desktop** — Where you'll use the server

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/spotify-mcp-server.git
cd spotify-mcp-server
npm install
npm run build
```

### 2. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set Redirect URI to `http://localhost:8888/callback`
4. Copy your **Client ID** (you don't need the secret — we use PKCE)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback
TOKEN_ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
TOKEN_STORAGE_PATH=~/.spotify-mcp/tokens.enc
```

### 4. Add to Claude Code

Add to your project's `.mcp.json` or global `~/.claude.json`:

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["D:/claude/spotify-mcp-server/dist/index.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_client_id",
        "SPOTIFY_REDIRECT_URI": "http://localhost:8888/callback",
        "TOKEN_ENCRYPTION_KEY": "your_64_char_hex_key",
        "TOKEN_STORAGE_PATH": "C:/Users/YOU/.spotify-mcp/tokens.enc"
      }
    }
  }
}
```

### 5. Use It

Just talk to Claude:

```
"Make me a playlist of 90s songs that sound like they were written by someone staring out a rain-covered window"
```

Claude will search Spotify, create the playlist, and add tracks — all automatically.

---

## Tools

| Tool | Description |
|------|-------------|
| `search_tracks` | Search Spotify's catalog. Supports Spotify query syntax (`track:Name artist:Artist`, `genre:jazz year:1960-1970`). Max 10 results (Dev Mode). |
| `create_playlist` | Create a new playlist with a creative name and description. |
| `add_tracks_to_playlist` | Add tracks by URI (from search results). Max 100 per call. |
| `remove_tracks_from_playlist` | Remove tracks by URI. |
| `get_playlist` | Get a playlist's details and full track listing. |
| `get_my_playlists` | List your playlists (paginated). |
| `disconnect_spotify` | Delete stored tokens and disconnect. |

## Creative Prompts

These are pre-built workflows that guide Claude to use its music knowledge:

| Prompt | What It Does |
|--------|-------------|
| `create_mood_playlist` | "Create a playlist for: *melancholic but hopeful*" — Claude picks songs that capture the exact emotional texture. |
| `create_thematic_playlist` | "Create a playlist around: *songs referencing Sisyphus*" — Literary, conceptual, metaphorical connections no algorithm can make. |
| `discover_similar` | "I love *Radiohead - Everything In Its Right Place*" — Claude's taste graph, not Spotify's algorithm. |
| `create_narrative_playlist` | "A road trip from hope to disillusionment to acceptance" — A soundtrack with acts, climax, and resolution. |
| `create_era_blend` | Blend "1960s Motown" with "2020s hyperpop" — Find unexpected common ground between two worlds. |

---

## How It Works

```
You: "Make me a playlist of songs about Sisyphus"
         │
         ▼
Claude (its own music knowledge):
  → Thinks of songs about futile struggle, endless repetition,
    finding meaning in the attempt
  → "Running Up That Hill" — Kate Bush
  → "Sisyphus" — Andrew Bird
  → "The Climb" — Miley Cyrus
  → "Boulder to Birmingham" — Emmylou Harris
  → ... 15 more tracks
         │
         ▼
MCP Server:
  → search_tracks("track:Running Up That Hill artist:Kate Bush")
  → create_playlist("The Beautiful Futility", "Songs about pushing...")
  → add_tracks_to_playlist(playlist_id, [...uris])
         │
         ▼
Your Spotify: New playlist with 20 perfectly curated tracks
```

**Key design decision:** Claude recommends songs from its own training data. Spotify is used only to search and create. At no point is Spotify data fed back to train or inform Claude's choices. This is both a feature (Claude's knowledge is the value) and a compliance requirement.

---

## Spotify Compliance

This server is designed to comply with Spotify's Developer Terms:

- **No AI training on Spotify data** — Claude's recommendations come from its own training
- **No content caching** — API responses are ephemeral; only encrypted auth tokens are stored
- **No streaming** — Playlist creation only; no audio playback
- **No DJ/mixing** — No audio manipulation
- **Feb 2026 API compliant** — Uses `/items` endpoints, respects search limits
- **Data deletion** — `disconnect_spotify` tool deletes all stored tokens
- **Spotify attribution** — Per [Brand Guidelines](https://developer.spotify.com/documentation/design)

### Dev Mode Limitations
- Requires Spotify Premium
- Limited to 5 test users
- Search results capped at 10 per query
- 1 Client ID per developer

---

## Development

```bash
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm test             # Run tests
npm run inspect      # Test with MCP Inspector
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a web UI where you can test each tool individually.

---

## Architecture

```
src/
├── index.ts                  # Entry: McpServer + StdioServerTransport
├── auth/
│   ├── pkce.ts               # PKCE verifier/challenge, token exchange
│   ├── token-store.ts        # AES-256-GCM encrypted token persistence
│   └── callback-server.ts    # Ephemeral localhost OAuth redirect handler
├── spotify/
│   ├── client.ts             # Auth-aware fetch wrapper, auto-refresh
│   ├── search.ts             # search_tracks
│   ├── playlists.ts          # create/get/list playlists
│   └── playlist-items.ts     # add/remove tracks (uses /items!)
├── tools/
│   ├── registry.ts           # Register all MCP tools
│   └── schemas.ts            # Zod input validation
├── prompts/
│   └── registry.ts           # Creative playlist prompts
├── resources/
│   └── registry.ts           # User profile, auth status
└── utils/
    ├── config.ts             # Env var validation
    ├── crypto.ts             # AES-256-GCM encrypt/decrypt
    ├── error-handler.ts      # Spotify → MCP error mapping
    └── rate-limiter.ts       # Adaptive sliding window
```

---

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Write tests for new functionality
4. Ensure `npm test` passes
5. Submit a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built with the [Model Context Protocol](https://modelcontextprotocol.io) and the [Spotify Web API](https://developer.spotify.com/documentation/web-api).*
