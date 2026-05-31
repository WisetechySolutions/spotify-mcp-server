# spotify-mcp-server — Code Review & Hardening Report

- **Date:** 2026-05-31
- **Version:** 1.0.0 → **1.1.0**
- **Integration:** Spotify Web API (OAuth2 authorization-code + PKCE), stdio transport, `@modelcontextprotocol/sdk` + zod
- **Note:** flagship public/open-source project (github.com/WisetechySolutions/spotify-mcp-server) — polish bar is highest here.
- **Method:** independent deep audit followed by a hardening pass.

## Final state
- typecheck: **pass**
- tests: 99 → **112 passing**
- `npm audit --omit=dev`: **0 vulnerabilities** (was 5 transitive-via-SDK; cleared via `overrides`) + SECURITY.md posture note
- build: clean
- commit: `ef18a2c`

## Findings & resolutions

### MEDIUM
1. **Response size cap was post-download** — `content-length` check skipped when absent; `safeParseJsonResponse` read the full body before checking. **FIXED:** `readBodyWithCap()` enforces the 1MB cap during transfer via a streaming/byte-counting reader that aborts on overflow. Test added.
2. **429 retry reused the original token and didn't handle a second 429/401.** **FIXED:** the bounded retry re-acquires the token after a 429 backoff, honors a second Retry-After, and lets 401-refresh and 429-backoff chain once each (no loops).
3. **SDK transitive audit vulns** present in the published tree. **FIXED:** `overrides` pin + a "Dependency Audit Posture" section in SECURITY.md documenting the stdio-only, transport-unreachable stance (important for a public repo).

### LOW
4. **`disconnect_spotify` omitted the annotations object.** **FIXED:** added `DESTRUCTIVE_HINT` + `confirm="DISCONNECT"`.
5. **`remove_tracks_from_playlist`** — added a runtime 100-cap mirroring `addTracksToPlaylist`.
6. **Redundant decrypt re-encrypt block** removed (GCM `final()` already authenticates).

## Strengths (preserved)
- OAuth2 + PKCE done right: rejection-sampled 128-char verifier, 256-bit state, constant-time compare, verifier zeroed after exchange.
- Genuinely hardened callback server (127.0.0.1-only with port verification, 4KB cap, 5s anti-slowloris, 5-request limit, 2-min auto-shutdown, full security headers, HTML-escaped errors).
- Best-in-class token storage (keyring + AES-256-GCM fallback + migration + structural/timestamp validation).
- Anti-SSRF (relative-path + host allow-list re-validated), prompt-injection fences on every attacker-influenced field, two-tier rate limiting, refresh-concurrency mutex.

## Notes
- All commits local on `main`; nothing pushed. This repo has a public GitHub home — push is available on request.
