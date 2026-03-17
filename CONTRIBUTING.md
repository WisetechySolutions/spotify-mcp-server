# Contributing

Thanks for your interest in improving the Spotify MCP Server!

## Getting Started

1. Fork the repo and clone your fork
2. `npm install`
3. `npm run build`
4. `npm test` — make sure everything passes before you start

## Development Workflow

```bash
npm run dev          # TypeScript watch mode
npm test             # Run tests
npm run inspect      # Test with MCP Inspector
```

## Adding a New Tool

1. Add the Zod schema in `src/tools/schemas.ts`
2. Implement the Spotify API call in the appropriate file under `src/spotify/`
3. Register the tool in `src/tools/registry.ts`
4. Add unit tests in `tests/unit/`
5. Update README with the new tool

## Adding a New Prompt

1. Add the prompt in `src/prompts/registry.ts`
2. Include detailed instructions for Claude in the prompt template
3. Update README with the new prompt

## Code Style

- TypeScript strict mode
- Explicit return types on exported functions
- Zod for all external input validation
- No Spotify data caching (compliance requirement)

## Testing

- Unit tests use Vitest
- Mock external API calls in unit tests
- Integration tests (in `tests/integration/`) require a real Spotify token — they're skipped in CI

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if needed
- Fill out the PR template

## Spotify Compliance

When contributing, ensure:
- No Spotify API response data is persisted to disk
- No content is cached beyond the current request
- Claude's music recommendations come from its training, not Spotify data
- New tools don't add streaming or audio playback functionality

## Questions?

Open a GitHub Issue or Discussion.
