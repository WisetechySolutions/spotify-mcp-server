# CLAUDE.md

Project instructions for Claude Code sessions.

## Project Overview

Spotify MCP Server — lets Claude create Spotify playlists through natural language.
Website at playmcp.dev (Astro 6, Cloudflare Pages).

## Commands

```bash
npm run build        # Compile TypeScript
npm test             # Run 99 tests (vitest)
npm run dev          # TypeScript watch mode
cd website && npm run build  # Build Astro site
```

## Architecture

```
src/
├── auth/          # PKCE OAuth, token store, callback server
├── spotify/       # API client, search, playlists, playlist-items
├── tools/         # MCP tool registration + Zod schemas
├── prompts/       # Creative playlist prompt templates
├── resources/     # User profile, auth status
└── utils/         # Config, crypto, error handler, rate limiter
website/           # Astro 6 companion site
```

## Rules

- **Security first.** Defense in depth on everything. Validate inputs, sanitize outputs, never leak tokens in errors.
- **No Spotify data caching.** API responses are ephemeral — never persist beyond the current request. This is a compliance requirement.
- **All API responses must go through `safeParseJsonResponse`.** Never use raw `response.json()`.
- **All string inputs must use the `safeString` Zod refinement.** Rejects null bytes and control characters.
- **Test everything.** New features need tests. Currently at 99 tests across 9 files.
- **Pin GitHub Actions to SHA hashes.** Never use version tags like `@v4`.
- **Internal docs are gitignored.** TODO.md, WEBAPP_PLAN.md, RESEARCH_PROMPTS.md, OUTREACH_DRAFTS.md never get committed.
- **Node 20+ required.** Vitest 4 needs it.
- **Commit messages should be descriptive.** Include what changed and why.
- **Don't add features without asking.** Keep changes focused on what was requested.

## Legal

- "Spotify" is a trademark of Spotify AB — we are not affiliated
- "Claude" is a trademark of Anthropic PBC — we are not affiliated
- MIT License with full disclaimer
- See NOTICE file for all third-party attributions
- Terms of Service includes 5 mandatory Spotify clauses
