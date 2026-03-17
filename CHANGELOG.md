# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
