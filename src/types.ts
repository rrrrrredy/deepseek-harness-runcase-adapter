export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type CapturedRunStatus =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "agent_timeout"
  | "agent_crash"
  | "infrastructure_error";

export interface CapturePatch {
  display_path: string;
  source_path: string;
  digest: string;
}

export interface CaptureInvocation {
  prompt: string;
  workspace: string;
  dsh_home: string;
  profile: string;
  provider: string;
  model: string;
  session_id: string;
  patches: CapturePatch[];
  git_commit?: string;
  reasoning_effort?: string;
  max_tokens?: number;
}

export interface CapturedNotification {
  method: string;
  params: JsonObject;
  received_at: string;
}

export interface CaptureResult {
  session_id: string;
  final_response: string;
  finish_reason?: string;
}

export interface CaptureError {
  name: string;
  message: string;
}

export interface CaptureRedaction {
  status: "applied" | "not_needed";
  secret_patterns_applied: string[];
  excluded_paths: string[];
  redacted_field_count: number;
}

export interface DeepSeekHarnessCapture {
  schema_version: "deepseek.harness.capture.v1";
  run_id: string;
  adapter_version: string;
  upstream: {
    product: "DeepSeek Harness";
    version: string;
    tag: string;
    commit: string;
    sdk_server_name: string;
    sdk_wire_version: string;
    protocol_negotiated: false;
  };
  invocation: CaptureInvocation;
  started_at: string;
  ended_at: string;
  status: CapturedRunStatus;
  notifications: CapturedNotification[];
  result?: CaptureResult;
  error?: CaptureError;
  redaction: CaptureRedaction;
}

export interface RecordRunOptions {
  prompt: string;
  workspace: string;
  dshHome: string;
  profile?: string;
  provider?: string;
  model?: string;
  sessionId?: string;
  patches?: string[];
  dshBin?: string;
  reasoningEffort?: string;
  maxTokens?: number;
  initializeTimeoutMs?: number;
  requestTimeoutMs?: number;
  excludedPaths?: string[];
  environment?: NodeJS.ProcessEnv;
}

export interface RecordedRun {
  capture: DeepSeekHarnessCapture;
  runCase: JsonObject;
}
