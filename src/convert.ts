import { createHash } from "node:crypto";
import { ProtocolValidator } from "@runcase/interchange";

import { jsonValue } from "./redaction.js";
import type { CapturedNotification, DeepSeekHarnessCapture, JsonObject, JsonValue } from "./types.js";

const validator = new ProtocolValidator();

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function eventType(raw: string): string {
  const normalized = raw.toLowerCase().replace(/[^a-z0-9_.-]+/g, ".").replace(/^\.+|\.+$/g, "");
  return /^[a-z]/.test(normalized) ? normalized : `event.${normalized || "unknown"}`;
}

function eventTimestamp(notification: CapturedNotification, startedAt: string): string {
  const event = notification.params.event;
  if (isObject(event) && typeof event.time === "number" && Number.isFinite(event.time)) {
    const candidate = new Date(event.time);
    const started = Date.parse(startedAt);
    const received = Date.parse(notification.received_at);
    if (
      !Number.isNaN(candidate.getTime()) &&
      candidate.getTime() >= started - 86_400_000 &&
      candidate.getTime() <= received + 86_400_000
    ) {
      return candidate.toISOString();
    }
  }
  return notification.received_at;
}

function summary(notification: CapturedNotification): string {
  if (notification.method === "session.status") {
    return `DeepSeek Harness session status: ${String(notification.params.status ?? "unknown")}`;
  }
  if (notification.method === "session.event" && isObject(notification.params.event)) {
    return `DeepSeek Harness ${String(notification.params.event.type ?? "session event")}`;
  }
  return `DeepSeek Harness ${notification.method}`;
}

function mappedEvent(notification: CapturedNotification, sequence: number, startedAt: string): JsonObject {
  const sessionEvent = notification.method === "session.event" && isObject(notification.params.event)
    ? notification.params.event
    : undefined;
  const rawType = sessionEvent === undefined
    ? `notification.${notification.method}`
    : String(sessionEvent.type ?? "session.event");
  const sourceSequence = sessionEvent !== undefined && typeof sessionEvent.seq === "number"
    ? String(sessionEvent.seq)
    : String(sequence);
  const eventId = `dsh-${sequence}-${digest(`${notification.method}:${sourceSequence}:${notification.received_at}`).slice(0, 12)}`;
  const dataValue = jsonValue({
    notification_method: notification.method,
    params: notification.params
  });
  const data = isObject(dataValue) ? dataValue as JsonObject : { value: dataValue };
  return {
    event_id: eventId,
    sequence,
    timestamp: eventTimestamp(notification, startedAt),
    received_at: notification.received_at,
    type: `dsh.${eventType(rawType)}`,
    source: "deepseek-harness-sdk",
    summary: summary(notification),
    data,
    content_refs: [],
    redacted: JSON.stringify(data).includes("[REDACTED]")
  };
}

function outcome(capture: DeepSeekHarnessCapture): JsonObject {
  const response = capture.result?.final_response.trim() ?? "";
  const conciseResponse = response.length > 500 ? `${response.slice(0, 497)}...` : response;
  if (capture.status === "succeeded") {
    return {
      status: "unknown",
      summary: conciseResponse
        ? `DeepSeek Harness completed and returned: ${conciseResponse} Task correctness was not independently verified.`
        : "DeepSeek Harness completed the captured activity interval; task correctness was not independently verified.",
      verifier_refs: []
    };
  }
  if (capture.status === "failed") {
    return {
      status: "unknown",
      summary: capture.error?.message ?? (conciseResponse || `DeepSeek Harness ended with ${capture.result?.finish_reason ?? "failure"}; task correctness was not verified.`),
      verifier_refs: []
    };
  }
  return {
    status: "unknown",
    summary: capture.error?.message ?? `The run ended as ${capture.status}; no task result is inferred.`,
    verifier_refs: []
  };
}

export function toRunCase(capture: DeepSeekHarnessCapture): JsonObject {
  const configurationPayload = JSON.stringify({
    profile: capture.invocation.profile,
    provider: capture.invocation.provider,
    model: capture.invocation.model,
    reasoning_effort: capture.invocation.reasoning_effort ?? null,
    max_tokens: capture.invocation.max_tokens ?? null,
    patches: capture.invocation.patches.map((patch) => ({ path: patch.display_path, digest: patch.digest }))
  });
  const files = capture.invocation.patches.map((patch) => ({
    path: patch.display_path,
    digest: patch.digest,
    kind: "other"
  }));
  const configuration: JsonObject = {
    snapshot_id: `sha256:${digest(configurationPayload)}`,
    files,
    working_directory: capture.invocation.workspace,
    environment: {
      profile: capture.invocation.profile,
      dsh_home: capture.invocation.dsh_home,
      sdk_wire_version: capture.upstream.sdk_wire_version
    }
  };
  if (capture.invocation.git_commit !== undefined) configuration.git_commit = capture.invocation.git_commit;

  const run: JsonObject = {
    schema_version: "agent.run.v1",
    run_id: capture.run_id,
    goal: {
      text: capture.invocation.prompt,
      source: "user"
    },
    agent: {
      product: "DeepSeek Harness",
      product_version: capture.upstream.version,
      adapter_version: `deepseek-harness-runcase-adapter/${capture.adapter_version}`,
      model: capture.invocation.model,
      model_provider: capture.invocation.provider
    },
    configuration,
    started_at: capture.started_at,
    ended_at: capture.ended_at,
    status: capture.status,
    capture: {
      mode: "managed",
      sources: [
        {
          name: "DeepSeek Harness SDK notification stream",
          version: capture.upstream.version,
          status: "available",
          details: `Pinned ${capture.upstream.tag}; wire ${capture.upstream.sdk_wire_version} has no version negotiation.`
        }
      ],
      completeness: "partial",
      gaps: [
        {
          gap_id: "dsh-prompt-causality",
          kind: "mapping_loss",
          summary: "The SDK owns a durable receipt-to-idle interval, but the wire does not assign an assistant message or turn/end to one prompt.",
          source: "DeepSeek Harness SDK"
        },
        {
          gap_id: "dsh-remote-subagent-finish",
          kind: "missing",
          summary: "Remote subagent completions are not reported by the SDK notification protocol.",
          source: "DeepSeek Harness SDK"
        },
        {
          gap_id: "dsh-reasoning-excluded",
          kind: "excluded",
          summary: "Hidden model reasoning is not available and is not inferred from session events.",
          source: "DeepSeek Harness SDK"
        },
        {
          gap_id: "dsh-artifact-snapshot",
          kind: "missing",
          summary: "The SDK stream does not provide a complete post-run filesystem or artifact manifest.",
          source: "DeepSeek Harness SDK"
        }
      ],
      redaction: {
        status: capture.redaction.status,
        secret_patterns_applied: capture.redaction.secret_patterns_applied,
        excluded_paths: capture.redaction.excluded_paths,
        redacted_field_count: capture.redaction.redacted_field_count
      }
    },
    events: capture.notifications.map((notification, index) => mappedEvent(notification, index, capture.started_at)),
    artifacts: [],
    outcome: outcome(capture),
    user_corrections: [],
    resource_usage: {
      duration_ms: Math.max(0, Date.parse(capture.ended_at) - Date.parse(capture.started_at))
    },
    extensions: {
      deepseek_harness: {
        capture_schema: capture.schema_version,
        session_id: capture.invocation.session_id,
        profile: capture.invocation.profile,
        upstream_tag: capture.upstream.tag,
        upstream_commit: capture.upstream.commit,
        sdk_server_name: capture.upstream.sdk_server_name,
        sdk_wire_version: capture.upstream.sdk_wire_version,
        protocol_negotiated: capture.upstream.protocol_negotiated,
        host_paths_retained: capture.invocation.host_paths_retained,
        notifications_captured: capture.notifications.length,
        final_response: capture.result?.final_response ?? null,
        finish_reason: capture.result?.finish_reason ?? null
      }
    }
  };
  assertValidRunCase(run);
  return run;
}

export function assertValidRunCase(document: JsonValue): void {
  const result = validator.validate(document, "agent.run.v1");
  if (!result.valid) {
    const details = result.errors
      .map((error) => `${error.instancePath || "$"}: ${error.message}`)
      .join("; ");
    throw new Error(`RunCase validation failed: ${details}`);
  }
}
