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

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Design

- OAuth tokens are encrypted at rest using AES-256-GCM
- PKCE flow used (no client secret stored)
- No Spotify data is cached or persisted beyond auth tokens
- All tokens can be deleted via the `disconnect_spotify` tool
