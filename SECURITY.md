# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Email:** security@WisetechySolutions.dev

**Please include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact

**Response timeline:**
- Acknowledgment within 48 hours
- Status update within 7 days
- Fix timeline communicated based on severity

Please do not open public issues for security vulnerabilities.

## Data Breach Notification

In the event of unauthorized access to user data (including stored OAuth tokens), WisetechySolutions will:

- Notify Spotify at security@spotify.com within **24 hours** of discovery (per Spotify Developer Terms)
- Notify affected users without undue delay
- Notify the relevant supervisory authority within **72 hours** (per GDPR Article 33, where applicable)
- Take immediate steps to contain and remediate the breach
- Publish a post-mortem after remediation is complete

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Design

### Encryption
- OAuth tokens encrypted at rest using AES-256-GCM (NIST SP 800-38D compliant)
- 12-byte IV (NIST recommended), 16-byte auth tag
- Key material wiped from memory after use
- Timing-safe auth tag verification

### Authentication
- PKCE OAuth flow (no client secret stored)
- 128-character code verifier, S256 challenge method
- 256-bit entropy state parameter
- Timing-safe state comparison
- Redirect URI restricted to localhost/127.0.0.1

### API Security
- Response size limit (1MB), request timeout (10s)
- URL host allow-list (api.spotify.com, accounts.spotify.com only)
- Content-Type validation before JSON parsing
- Prototype pollution guard on all parsed responses
- Input validation: null byte/control character rejection, regex format checks
- Rate limiting: 30 req/30s sliding window, 60 req/min hard ceiling

### Data Handling
- No Spotify data cached or persisted beyond encrypted auth tokens
- Token file size validated before reading (max 10KB)
- Token structure validated after decryption
- All tokens deletable via `disconnect_spotify` tool
- Spotify user data deleted within 5 days of disconnect (per Spotify Developer Terms)

### Website
- Cloudflare Pages with full security headers (HSTS, CSP, X-Frame-Options, CORP, COOP, COEP)
- No cookies, no tracking pixels, no fingerprinting
- Cloudflare DDoS protection (always-on)

## Dependency Audit Posture

`npm audit` may report advisories in the transitive dependency tree pulled in by
`@modelcontextprotocol/sdk` (historically: `hono`, `qs`, `fast-uri`,
`ip-address`, `express-rate-limit`). We treat these seriously, but their
real-world reachability in this project is effectively zero:

- **stdio-only transport.** This server speaks the Model Context Protocol over
  **stdio** (`StdioServerTransport`). It does **not** open a listening socket,
  start an HTTP server, or expose any network transport. The HTTP/web-framework
  code (`hono`, `express`, `express-rate-limit`, `qs`) that those advisories
  affect is part of the SDK's *optional* HTTP/SSE transport, which this server
  never imports or instantiates. That code path is unreachable at runtime.
- **No untrusted HTTP parsing surface.** Because no HTTP transport is started,
  there is no attacker-controlled request to reach the vulnerable parsers.
- **Defense in depth regardless.** We still pin patched versions via a
  `package.json` `overrides` block (`fast-uri`, `hono`, `ip-address`, `qs`) so
  `npm audit` is clean and contributors are not desensitized to warnings. The
  overrides are validated against the full test suite and a clean build.

In short: the advisories are mitigated by transport posture (unreachable) **and**
remediated by pinning (patched). A clean `npm audit --omit=dev` is maintained as
a contributor-facing baseline.
