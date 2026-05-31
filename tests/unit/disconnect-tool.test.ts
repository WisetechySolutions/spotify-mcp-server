import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the spotify client so disconnect's deleteTokens() has no real side
// effects. Preserve all other real exports (search.ts/playlists.ts import them).
const { deleteTokens } = vi.hoisted(() => ({ deleteTokens: vi.fn(async () => {}) }));
vi.mock("../../src/spotify/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/spotify/client.js")>();
  return { ...actual, deleteTokens };
});

import { registerTools } from "../../src/tools/registry.js";

type Handler = (params: Record<string, unknown>, extra: unknown) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}>;

interface CapturedTool {
  name: string;
  description: string;
  shape: Record<string, unknown>;
  annotations: Record<string, unknown> | undefined;
  handler: Handler;
}

/**
 * Minimal fake McpServer that captures every server.tool() registration.
 * Mirrors the SDK signature used in registry.ts:
 *   server.tool(name, description, shape, annotations, handler)
 */
function makeFakeServer() {
  const tools: CapturedTool[] = [];
  const server = {
    tool(name: string, description: string, shape: Record<string, unknown>, ...rest: unknown[]) {
      const handler = rest[rest.length - 1] as Handler;
      const annotations =
        rest.length > 1 ? (rest[0] as Record<string, unknown>) : undefined;
      tools.push({ name, description, shape, annotations, handler });
    },
  };
  return { server, tools };
}

describe("disconnect_spotify destructive tool", () => {
  beforeEach(() => {
    deleteTokens.mockClear();
  });

  function getDisconnect() {
    const { server, tools } = makeFakeServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(server as any);
    const tool = tools.find((t) => t.name === "disconnect_spotify");
    if (!tool) throw new Error("disconnect_spotify not registered");
    return tool;
  }

  it("carries the DESTRUCTIVE_HINT annotation", () => {
    const tool = getDisconnect();
    expect(tool.annotations).toBeDefined();
    expect(tool.annotations?.destructiveHint).toBe(true);
    expect(tool.annotations?.idempotentHint).toBe(false);
  });

  it("declares a confirm input in its schema shape", () => {
    const tool = getDisconnect();
    expect(tool.shape).toHaveProperty("confirm");
  });

  it("documents the confirm requirement in its description", () => {
    const tool = getDisconnect();
    expect(tool.description).toContain("DISCONNECT");
    expect(tool.description.toUpperCase()).toContain("DESTRUCTIVE");
  });

  it("does NOT delete tokens when confirm is missing/wrong", async () => {
    const tool = getDisconnect();
    const res = await tool.handler({ confirm: "yes" }, {});
    expect(res.isError).toBe(true);
    expect(deleteTokens).not.toHaveBeenCalled();
  });

  it("deletes tokens only when confirm is exactly DISCONNECT", async () => {
    const tool = getDisconnect();
    const res = await tool.handler({ confirm: "DISCONNECT" }, {});
    expect(res.isError).toBeUndefined();
    expect(deleteTokens).toHaveBeenCalledTimes(1);
    expect(res.content[0].text).toContain("disconnected");
  });
});
