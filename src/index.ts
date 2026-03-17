#!/usr/bin/env node

/**
 * Spotify MCP Server
 *
 * Lets Claude create Spotify playlists through natural language.
 * Claude brings the music knowledge. Spotify brings the catalog.
 * This server is the bridge.
 *
 * @see https://modelcontextprotocol.io
 * @see https://developer.spotify.com/documentation/web-api
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/registry.js";
import { registerPrompts } from "./prompts/registry.js";
import { registerResources } from "./resources/registry.js";
import { getConfig } from "./utils/config.js";

async function main(): Promise<void> {
  // Validate config early — fail fast with clear errors
  try {
    getConfig();
  } catch (err) {
    process.stderr.write(`\n${(err as Error).message}\n\n`);
    process.stderr.write(
      "Set these environment variables or create a .env file.\n" +
        "See .env.example for details.\n\n"
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: "spotify",
    version: "1.0.0",
    description:
      "Create Spotify playlists with Claude's music knowledge. " +
      "Search tracks, build thematic playlists, discover music through " +
      "literary connections, narrative arcs, and creative curation.",
  });

  // Register all capabilities
  registerTools(server);
  registerPrompts(server);
  registerResources(server);

  // Connect via STDIO transport (local-first, no network exposure)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write("🎵 Spotify MCP server running (stdio transport)\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${(err as Error).message}\n`);
  process.exit(1);
});
