import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** http(s) URL -> HTTP transport; anything else -> a stdio command. */
export function classifyTarget(target: string): "http" | "stdio" {
  try {
    const u = new URL(target);
    if (u.protocol === "http:" || u.protocol === "https:") return "http";
  } catch {
    // not a URL — treat it as a stdio command
  }
  return "stdio";
}

export interface OpenResult {
  client: Client;
  transport: "stdio" | "http-streamable" | "http-sse";
  close: () => Promise<void>;
}

const DEFAULT_INFO = { name: "mcpcert", version: "0.2.0" };

/**
 * Connect to an MCP server. stdio commands spawn a child process; http(s)
 * targets try Streamable HTTP first and fall back to the older SSE transport.
 */
export async function openClient(target: string, info = DEFAULT_INFO): Promise<OpenResult> {
  if (classifyTarget(target) === "stdio") {
    const [command, ...args] = target.split(/\s+/).filter(Boolean);
    const client = new Client(info, { capabilities: {} });
    await client.connect(new StdioClientTransport({ command: command ?? "", args }));
    return { client, transport: "stdio", close: () => safeClose(client) };
  }

  const url = new URL(target);
  try {
    const client = new Client(info, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(url));
    return { client, transport: "http-streamable", close: () => safeClose(client) };
  } catch (streamErr) {
    try {
      const client = new Client(info, { capabilities: {} });
      await client.connect(new SSEClientTransport(url));
      return { client, transport: "http-sse", close: () => safeClose(client) };
    } catch (sseErr) {
      throw new Error(`Streamable HTTP failed (${msg(streamErr)}); SSE failed (${msg(sseErr)})`);
    }
  }
}

async function safeClose(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // best-effort teardown
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
