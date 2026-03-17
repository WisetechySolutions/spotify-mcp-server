<div align="center">

[![npm version](https://img.shields.io/npm/v/spotify-mcp-server.svg?style=flat-square&color=1DB954)](https://www.npmjs.com/package/spotify-mcp-server)
[![CI](https://github.com/WisetechySolutions/spotify-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/WisetechySolutions/spotify-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square)](https://www.typescriptlang.org/)

<br />

<img src="https://raw.githubusercontent.com/WisetechySolutions/spotify-mcp-server/main/website/public/favicon.svg" width="80" alt="Spotify MCP Server" />

# Spotify MCP Server

**Turn Claude into the world's most creative DJ.**

Claude brings deep music knowledge — genres, themes, lyrics, cultural connections, obscure references.<br />
Spotify brings 100M+ tracks. This server is the bridge.

[Get Started](https://playmcp.dev/setup) &nbsp;&middot;&nbsp; [Examples](https://playmcp.dev/examples) &nbsp;&middot;&nbsp; [npm](https://www.npmjs.com/package/spotify-mcp-server)

</div>

---

> *"Make me a playlist of songs about pushing boulders uphill — Sisyphus vibes, futile struggle turned beautiful."*
>
> Claude thinks, searches, creates. You get **"The Beautiful Futility"** — 20 tracks spanning Kate Bush to Andrew Bird, perfectly ordered.

## Why This Exists

**What makes this different from Spotify's own recommendations?** Claude can handle requests no algorithm can:

- *"Songs referencing Greek mythology"*
- *"Songs where the narrator is talking to their past self"*
- *"A playlist that tells the story of a relationship from first date to breakup"*
- *"Jazz-to-electronic pipeline — start mellow, end cosmic"*
- *"Songs two rivals would play at each other in a musical argument"*

Data from Spotify. Taste from Claude.

## Quick Start

### Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org)
- **Spotify Premium** — Required for Dev Mode API access
- **Claude Code** or **Claude Desktop** — Where you'll use the server

### 1. Clone & Build

```bash
git clone https://github.com/WisetechySolutions/spotify-mcp-server.git
cd spotify-mcp-server
npm install && npm run build
```

### 2. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set Redirect URI to `http://127.0.0.1:8888/callback`
4. Copy your **Client ID** (you don't need the secret — we use PKCE)

### 3. Configure

```bash
cp .env.example .env
```

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
TOKEN_ENCRYPTION_KEY=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
TOKEN_STORAGE_PATH=~/.spotify-mcp/tokens.enc
```

### 4. Add to Claude

Add to your `.mcp.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["/path/to/spotify-mcp-server/dist/index.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_client_id",
        "SPOTIFY_REDIRECT_URI": "http://127.0.0.1:8888/callback",
        "TOKEN_ENCRYPTION_KEY": "your_64_char_hex_key",
        "TOKEN_STORAGE_PATH": "~/.spotify-mcp/tokens.enc"
      }
    }
  }
}
```

### 5. Create

```
"Make me a playlist of 90s songs that sound like they were written
by someone staring out a rain-covered window"
```

Claude searches Spotify, creates the playlist, adds tracks — all automatically.

## Tools

| Tool | Description |
|:-----|:------------|
| `search_tracks` | Search Spotify's catalog with rich query syntax (`track:`, `artist:`, `genre:`, `year:`) |
| `create_playlist` | Create a playlist with a creative name and description |
| `add_tracks_to_playlist` | Add up to 100 tracks per call by URI |
| `remove_tracks_from_playlist` | Remove tracks by URI |
| `get_playlist` | Get playlist details and full track listing |
| `get_my_playlists` | List your playlists (paginated) |
| `disconnect_spotify` | Delete stored tokens and disconnect |

## Creative Prompts

Built-in prompt templates that guide Claude's curation:

| Prompt | What It Does |
|:-------|:------------|
| `create_mood_playlist` | Captures exact emotional textures: *"melancholic but hopeful"* |
| `create_thematic_playlist` | Literary, conceptual connections: *"songs referencing Sisyphus"* |
| `discover_similar` | Claude's taste graph, not Spotify's algorithm |
| `create_narrative_playlist` | Soundtracks with acts, climax, resolution |
| `create_era_blend` | Bridge two musical worlds: *"1960s Motown × 2020s hyperpop"* |

## How It Works

```
You → "Make me a playlist of songs about Sisyphus"
       │
       ▼
Claude (its own music knowledge):
  → Thinks of songs about futile struggle, endless repetition,
    finding meaning in the attempt
  → Kate Bush, Andrew Bird, Miley Cyrus, Emmylou Harris...
       │
       ▼
MCP Server:
  → search_tracks("track:Running Up That Hill artist:Kate Bush")
  → create_playlist("The Beautiful Futility", ...)
  → add_tracks_to_playlist(playlist_id, [...uris])
       │
       ▼
Your Spotify → New playlist with 20 perfectly curated tracks
```

**Key design decision:** Claude recommends from its own knowledge. Spotify is used only to search and create. No Spotify data is fed back to inform Claude's choices — this is both a feature (Claude's knowledge *is* the value) and a compliance requirement.

## Security

- **PKCE OAuth** — No client secret needed or stored
- **AES-256-GCM** — Tokens encrypted at rest with your key
- **No data caching** — API responses are ephemeral
- **Full data deletion** — `disconnect_spotify` removes all tokens
- **Zero production vulnerabilities** — Verified via `npm audit`

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Spotify Compliance

Designed to comply with Spotify's Developer Terms (Feb 2026):

- **No AI training on Spotify data** — Claude's knowledge is the source
- **No content caching** — Only encrypted auth tokens are persisted
- **No streaming or audio playback** — Playlist creation only
- **No DJ/mixing or audio manipulation**
- **Uses `/items` endpoints** — Compliant with current API
- **Spotify attribution** — Per [Brand Guidelines](https://developer.spotify.com/documentation/design)

### Dev Mode Limitations

- Spotify Premium required
- Limited to 5 test users per app
- Search results capped at 10 per query
- 1 Client ID per developer

## Architecture

```
src/
├── index.ts                  # McpServer + StdioServerTransport
├── auth/
│   ├── pkce.ts               # PKCE verifier/challenge, token exchange
│   ├── token-store.ts        # AES-256-GCM encrypted token persistence
│   └── callback-server.ts    # Ephemeral localhost OAuth redirect handler
├── spotify/
│   ├── client.ts             # Auth-aware fetch wrapper, auto-refresh
│   ├── search.ts             # search_tracks implementation
│   ├── playlists.ts          # create/get/list playlists
│   └── playlist-items.ts     # add/remove tracks (uses /items)
├── tools/
│   ├── registry.ts           # MCP tool registration
│   └── schemas.ts            # Zod input validation
├── prompts/
│   └── registry.ts           # Creative playlist prompt templates
├── resources/
│   └── registry.ts           # User profile, auth status resources
└── utils/
    ├── config.ts             # Environment validation
    ├── crypto.ts             # AES-256-GCM encrypt/decrypt
    ├── error-handler.ts      # Spotify → MCP error mapping
    └── rate-limiter.ts       # Adaptive sliding window
```

## Development

```bash
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm test             # Run 93 tests
npm run inspect      # Test with MCP Inspector
```

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a PR.

## License

[MIT](LICENSE) — free for personal and commercial use.

## Disclaimer

This project is not affiliated with, endorsed by, or associated with Spotify AB or Anthropic PBC. "Spotify" is a registered trademark of Spotify AB. All Spotify data is accessed through the official [Spotify Web API](https://developer.spotify.com/documentation/web-api) in accordance with their Developer Terms of Service.

---

<div align="center">

Built with the [Model Context Protocol](https://modelcontextprotocol.io) and the [Spotify Web API](https://developer.spotify.com/documentation/web-api)

**[WisetechySolutions](https://github.com/WisetechySolutions)**

</div>
