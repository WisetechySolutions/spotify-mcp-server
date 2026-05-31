# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-28

### Security
- **Streaming response size cap.** The 1MB response limit is now enforced
  *during transfer* via a byte-counting stream reader (`readBodyWithCap`),
  instead of after a full `response.text()` download. A response that omits or
  lies about `Content-Length` can no longer force the server to buffer an
  unbounded body into memory.
- **Hardened 429/401 retry.** The single bounded retry now re-acquires the
  access token after a 429 backoff (in case it expired mid-sleep), honors a
  second `Retry-After`, and chains a 401-refresh into a 429-backoff (and vice
  versa) while keeping the loop structurally bounded (each path fires at most
  once — no retry loops).
- **`disconnect_spotify` now confirm-gated.** Added a `DESTRUCTIVE_HINT`
  annotation (`destructiveHint: true`, `idempotentHint: false`) and a required
  `confirm: "DISCONNECT"` literal, matching the destructive-tool pattern used by
  `remove_tracks_from_playlist`.
- **Transitive dependency advisories remediated.** Added a `package.json`
  `overrides` block pinning patched `fast-uri`, `hono`, `ip-address`, and `qs`.
  `npm audit --omit=dev` goes from 5 vulnerabilities (1 high, 4 moderate) to 0.
  Expanded `SECURITY.md` with the stdio-only transport posture (the affected
  HTTP-transport code is never imported, so it is unreachable at runtime).

### Changed
- `remove_tracks_from_playlist` API layer now enforces the same runtime 100-URI
  cap as `add_tracks_to_playlist` (defense in depth alongside the Zod schema).
- Removed a redundant re-encryption pass in `crypto.decrypt`. AES-GCM already
  authenticates the ciphertext via `decipher.final()`; the extra `createCipheriv`
  round was wasted work, not added safety.

### Added
- `npm run typecheck` script (`tsc --noEmit`).
- Tests: streaming response cap (oversized header-less body aborts during
  transfer; producer is not fully drained), `disconnect_spotify` confirm-gating
  and destructive annotation, and the `remove_tracks_from_playlist` 100-cap.

## [1.0.0] - 2026-03-15

### Added
- Initial release
- **Tools:** search_tracks, create_playlist, add_tracks_to_playlist, remove_tracks_from_playlist, get_playlist, get_my_playlists, disconnect_spotify
- **Prompts:** create_mood_playlist, create_thematic_playlist, discover_similar, create_narrative_playlist, create_era_blend
- **Resources:** spotify-profile, spotify-auth-status
- OAuth 2.0 PKCE authentication flow
- AES-256-GCM encrypted token storage
- Adaptive rate limiting with 429/Retry-After handling
- Automatic token refresh
- Comprehensive error handling with user-friendly messages
- Full test suite (crypto, PKCE, config, token store, rate limiter)
- Feb 2026 Spotify API compliance (uses `/items` endpoints)
