#!/usr/bin/env node

import { createInterface } from "node:readline";

const output = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const notify = (method, params) => output({ jsonrpc: "2.0", method, params });
let sequence = 0;

function event(sessionId, type, data) {
  notify("session.event", {
    sessionId,
    event: { type, seq: sequence++, time: Date.now(), data }
  });
}

const reader = createInterface({ input: process.stdin });
reader.on("line", (line) => {
  if (!line.trim()) return;
  const frame = JSON.parse(line);
  if (frame.id === undefined || typeof frame.method !== "string") return;
  const respond = (result) => output({ jsonrpc: "2.0", id: frame.id, result });
  if (frame.method === "initialize") {
    respond({ serverInfo: { name: "deepseek-harness-sdk-runtime", version: "0.0.1" } });
    return;
  }
  if (frame.method === "session/prompt") {
    const sessionId = frame.params?.sessionId ?? "session-unknown";
    const messageId = `fake-user-${sequence}`;
    event(sessionId, "agent/inbox/spliced", {
      target: "next-turn",
      start: 0,
      inserted: [{ id: messageId, role: "user", content: [], source: { kind: "user" } }]
    });
    notify("session.status", { sessionId, status: "running" });
    respond({ messageId });
    if (process.env.FAKE_DSH_MODE === "crash") {
      event(sessionId, "assistant/chunk", {
        turn: 0,
        step: 0,
        chunk: { type: "text-delta", index: 0, text: "partial before crash" }
      });
      setImmediate(() => process.exit(17));
      return;
    }
    const text = process.env.FAKE_TEXT ?? "hello from fake DeepSeek Harness";
    event(sessionId, "turn/start", { turn: 0 });
    event(sessionId, "assistant/message", {
      turn: 0,
      step: 0,
      message: {
        id: `fake-assistant-${sequence}`,
        role: "assistant",
        content: [{ type: "text", text }],
        source: { kind: "model", provider: "fake", model: "fake" }
      }
    });
    event(sessionId, "turn/end", { turn: 0, reason: { kind: "completed" } });
    notify("session.status", { sessionId, status: "idle" });
    return;
  }
  if (frame.method === "shutdown") {
    respond({});
    setImmediate(() => process.exit(0));
    return;
  }
  output({ jsonrpc: "2.0", id: frame.id, error: { code: -32601, message: "unknown method" } });
});
