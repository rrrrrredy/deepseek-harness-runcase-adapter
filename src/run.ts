import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  DeepSeekHarness,
  type DeepSeekHarnessOptions,
  type HarnessNotification,
  type RunResult
} from "@deepseek-ai/dsh-sdk-client";

import { toRunCase } from "./convert.js";
import { jsonValue, redactJson } from "./redaction.js";
import type {
  CapturedNotification,
  CapturedRunStatus,
  CapturePatch,
  DeepSeekHarnessCapture,
  JsonObject,
  RecordRunOptions,
  RecordedRun
} from "./types.js";

export const adapterVersion = "0.1.0";

const upstream = {
  product: "DeepSeek Harness" as const,
  version: "0.1.2-alpha.2",
  tag: "dsh-v0.1.2-alpha.2",
  commit: "0a53fb55bea101816fa226bb964ae2bed71c343b",
  sdk_server_name: "deepseek-harness-sdk-runtime",
  sdk_wire_version: "0.0.1",
  protocol_negotiated: false as const
};

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function displayPath(path: string, workspace: string): string {
  const absolute = resolve(path);
  const inside = relative(workspace, absolute);
  if (inside && !inside.startsWith("..") && !isAbsolute(inside)) return inside.replaceAll("\\", "/");
  return `_external/${sha256(absolute).slice(7, 19)}-${basename(absolute)}`;
}

function capturePatches(paths: string[], workspace: string): CapturePatch[] {
  return paths.map((path) => {
    const absolute = resolve(path);
    if (!existsSync(absolute)) throw new Error(`DeepSeek Harness patch does not exist: ${absolute}`);
    const shown = displayPath(absolute, workspace);
    return { display_path: shown, source_path: shown, digest: sha256(readFileSync(absolute)) };
  });
}

function gitCommit(workspace: string): string | undefined {
  const result = spawnSync("git", ["-C", workspace, "rev-parse", "HEAD"], { encoding: "utf8" });
  const candidate = result.status === 0 ? result.stdout.trim() : "";
  return /^[0-9a-f]{40}$/i.test(candidate) ? candidate : undefined;
}

function finishReason(result: RunResult): string | undefined {
  for (let index = result.events.length - 1; index >= 0; index -= 1) {
    const event = result.events[index] as unknown;
    if (event === null || typeof event !== "object" || !("type" in event) || event.type !== "turn/end") continue;
    if (!("data" in event) || event.data === null || typeof event.data !== "object" || !("reason" in event.data)) return undefined;
    const reason = event.data.reason;
    return reason !== null && typeof reason === "object" && "kind" in reason && typeof reason.kind === "string"
      ? reason.kind
      : undefined;
  }
  return undefined;
}

function statusForResult(reason: string | undefined): CapturedRunStatus {
  if (reason === "aborted") return "cancelled";
  return reason === "error" || reason === "max-tokens" ? "failed" : "succeeded";
}

function statusForError(error: unknown): CapturedRunStatus {
  const candidate = error as NodeJS.ErrnoException;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/initializ|handshake/i.test(message) && /timed?\s*out|timeout/i.test(message)) return "infrastructure_error";
  if (/timed?\s*out|timeout/i.test(message)) return "agent_timeout";
  if (candidate.code === "ENOENT" || /spawn|executable|profile handshake/i.test(message)) return "infrastructure_error";
  if (/exited|transport|closed|pipe|EOF/i.test(message)) return "agent_crash";
  return "infrastructure_error";
}

function errorRecord(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name || "Error", message: error.message }
    : { name: "Error", message: String(error) };
}

function captureNotification(notification: HarnessNotification): CapturedNotification {
  const params = jsonValue(notification.params);
  return {
    method: notification.method,
    params: params !== null && typeof params === "object" && !Array.isArray(params) ? params : { value: params },
    received_at: new Date().toISOString()
  };
}

export async function recordDeepSeekRun(options: RecordRunOptions): Promise<RecordedRun> {
  const workspace = resolve(options.workspace);
  const dshHome = resolve(options.dshHome);
  const workspaceRecord = options.retainHostPaths ? workspace : ".";
  const dshHomeRecord = options.retainHostPaths ? dshHome : "_runtime/deepseek-harness";
  const patches = capturePatches(options.patches ?? [], workspace);
  const commit = gitCommit(workspace);
  const excludedPathLabels = (options.excludedPaths ?? []).map((_, index) => `user-excluded-path-${index + 1}`);
  const startedAt = new Date().toISOString();
  const notifications: CapturedNotification[] = [];
  const sessionId = options.sessionId ?? `runcase-${randomUUID().replaceAll("-", "")}`;
  const harnessOptions: DeepSeekHarnessOptions = {
    cwd: workspace,
    processCwd: workspace,
    dshHome,
    profile: options.profile ?? "sdk",
    provider: options.provider ?? "deepseek-official",
    model: options.model ?? "deepseek-v4-flash",
    patches: (options.patches ?? []).map((path) => resolve(path)),
    env: { ...process.env, ...options.environment },
    ...(options.dshBin === undefined ? {} : { dshBin: resolve(options.dshBin) }),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: options.reasoningEffort as NonNullable<DeepSeekHarnessOptions["reasoningEffort"]> }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options.initializeTimeoutMs === undefined ? {} : { initializeTimeoutMs: options.initializeTimeoutMs }),
    ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs })
  };
  const harness = new DeepSeekHarness(harnessOptions);
  let result: RunResult | undefined;
  let runError: unknown;
  let closeError: unknown;
  try {
    result = await harness.run(options.prompt, {
      sessionId,
      onNotification: (notification) => notifications.push(captureNotification(notification))
    });
  } catch (error) {
    runError = error;
  } finally {
    try {
      await harness.close();
    } catch (error) {
      closeError = error;
    }
  }
  const reason = result === undefined ? undefined : finishReason(result);
  const failure = runError ?? closeError;
  const raw: DeepSeekHarnessCapture = {
    schema_version: "deepseek.harness.capture.v1",
    run_id: randomUUID(),
    adapter_version: adapterVersion,
    upstream,
    invocation: {
      prompt: options.prompt,
      workspace: workspaceRecord,
      dsh_home: dshHomeRecord,
      host_paths_retained: options.retainHostPaths === true,
      profile: options.profile ?? "sdk",
      provider: options.provider ?? "deepseek-official",
      model: options.model ?? "deepseek-v4-flash",
      session_id: result?.sessionId ?? sessionId,
      patches,
      ...(commit === undefined ? {} : { git_commit: commit }),
      ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }),
      ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens })
    },
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    status: failure === undefined ? statusForResult(reason) : statusForError(failure),
    notifications,
    ...(result === undefined
      ? {}
      : {
          result: {
            session_id: result.sessionId,
            final_response: result.finalResponse,
            ...(reason === undefined ? {} : { finish_reason: reason })
          }
        }),
    ...(failure === undefined ? {} : { error: errorRecord(failure) }),
    redaction: {
      status: "not_needed",
      secret_patterns_applied: [],
      excluded_paths: excludedPathLabels,
      redacted_field_count: 0
    }
  };
  const redacted = redactJson(jsonValue(raw), options.excludedPaths ?? []);
  const capture = redacted.value as unknown as DeepSeekHarnessCapture;
  capture.redaction = {
    status: redacted.redactedCount > 0 ? "applied" : "not_needed",
    secret_patterns_applied: redacted.appliedPatterns,
    excluded_paths: excludedPathLabels,
    redacted_field_count: redacted.redactedCount
  };
  return { capture, runCase: toRunCase(capture) };
}
