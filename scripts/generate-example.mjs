import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { toRunCase } from "../dist/src/convert.js";

const startedAt = "2026-08-31T09:00:00.000Z";
const endedAt = "2026-08-31T09:00:03.000Z";
const sessionId = "runcase-example-session";
const capture = {
  schema_version: "deepseek.harness.capture.v1",
  run_id: "55555555-5555-4555-8555-555555555555",
  adapter_version: "0.1.0",
  upstream: {
    product: "DeepSeek Harness",
    version: "0.1.2-alpha.2",
    tag: "dsh-v0.1.2-alpha.2",
    commit: "0a53fb55bea101816fa226bb964ae2bed71c343b",
    sdk_server_name: "deepseek-harness-sdk-runtime",
    sdk_wire_version: "0.0.1",
    protocol_negotiated: false
  },
  invocation: {
    prompt: "Inspect the parser and explain the change.",
    workspace: "/workspace/example",
    dsh_home: "/workspace/.dsh",
    profile: "sdk",
    provider: "deepseek-official",
    model: "deepseek-v4-flash",
    session_id: sessionId,
    patches: [],
    git_commit: "0123456789abcdef0123456789abcdef01234567"
  },
  started_at: startedAt,
  ended_at: endedAt,
  status: "succeeded",
  notifications: [
    {
      method: "session.event",
      params: {
        sessionId,
        event: {
          type: "agent/inbox/spliced",
          seq: 0,
          time: Date.parse(startedAt),
          data: { inserted: [{ id: "example-user", role: "user" }] }
        }
      },
      received_at: startedAt
    },
    {
      method: "session.status",
      params: { sessionId, status: "running" },
      received_at: "2026-08-31T09:00:00.010Z"
    },
    {
      method: "session.event",
      params: {
        sessionId,
        event: {
          type: "assistant/message",
          seq: 1,
          time: Date.parse("2026-08-31T09:00:02.500Z"),
          data: { message: { role: "assistant", content: [{ type: "text", text: "The parser change is ready for review." }] } }
        }
      },
      received_at: "2026-08-31T09:00:02.510Z"
    },
    {
      method: "session.event",
      params: {
        sessionId,
        event: { type: "turn/end", seq: 2, time: Date.parse(endedAt), data: { reason: { kind: "completed" } } }
      },
      received_at: endedAt
    },
    {
      method: "session.status",
      params: { sessionId, status: "idle" },
      received_at: endedAt
    }
  ],
  result: {
    session_id: sessionId,
    final_response: "The parser change is ready for review.",
    finish_reason: "completed"
  },
  redaction: {
    status: "applied",
    secret_patterns_applied: ["secret-key-name", "bearer-token"],
    excluded_paths: [".env"],
    redacted_field_count: 0
  }
};

const run = toRunCase(capture);
const destination = resolve("examples/agent.run.deepseek.sample.json");
mkdirSync(resolve("examples"), { recursive: true });
writeFileSync(destination, `${JSON.stringify(run, null, 2)}\n`, "utf8");
process.stdout.write(`${destination}\n`);
