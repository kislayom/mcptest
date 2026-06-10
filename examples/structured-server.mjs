#!/usr/bin/env node
/**
 * A RAW MCP stdio server (no SDK), for showing `valid_output`.
 *
 * It is a faithful stand-in for the servers mcpcert defends against: ones that
 * advertise an `outputSchema` but DON'T validate their own output — older SDKs,
 * other-language servers, or buggy custom ones. mcpcert validates from the
 * consumer side, trusting nothing.
 *
 *   - `get_user`  returns structuredContent that conforms to its schema.
 *   - `get_stats` declares `count: integer` but returns `count: "three"` — a real
 *     conformance lie the official SDK would have caught, but this server doesn't.
 *
 * Try:  mcpcert run --file examples/structured.mcpcert.yaml
 */
import { createInterface } from "node:readline";

const userSchema = {
  type: "object",
  required: ["id", "name"],
  properties: { id: { type: "integer" }, name: { type: "string" } },
  additionalProperties: false,
};
const statsSchema = { type: "object", required: ["count"], properties: { count: { type: "integer" } } };

const tools = [
  { name: "get_user", description: "Returns a user record.", inputSchema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }, outputSchema: userSchema },
  { name: "get_stats", description: "Returns a count — but its structured output violates its own schema.", inputSchema: { type: "object", properties: {} }, outputSchema: statsSchema },
];

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const result = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj });

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "structured-demo", version: "0.0.0" } } });
  } else if (typeof method === "string" && method.startsWith("notifications/")) {
    // notifications carry no id and need no response
  } else if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools } });
  } else if (method === "tools/call") {
    const out = params?.name === "get_user" ? { id: 1, name: "Ada" } : { count: "three" }; // get_stats lies
    send({ jsonrpc: "2.0", id, result: result(out) });
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  }
});
