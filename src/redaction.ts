import type { JsonObject, JsonValue } from "./types.js";

const secretKeyPattern = /(?:^|[_-])(?:api[_-]?key|authorization|cookie|credential|password|secret|token)(?:$|[_-])/i;

const stringPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { name: "sk-token", pattern: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "credential-assignment",
    pattern: /\b(?:DEEPSEEK|OPENAI|ANTHROPIC|GITHUB|GITLAB)_(?:API_)?(?:KEY|TOKEN)=\S+/gi
  }
];

export interface RedactionResult<T extends JsonValue> {
  value: T;
  redactedCount: number;
  appliedPatterns: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactJson<T extends JsonValue>(input: T, excludedPaths: string[] = []): RedactionResult<T> {
  let redactedCount = 0;
  const appliedPatterns = new Set<string>();
  const pathPatterns = excludedPaths
    .filter((path) => path.trim().length > 0)
    .map((path) => ({ name: "excluded-path", pattern: new RegExp(escapeRegex(path), "gi") }));

  const redactString = (value: string): string => {
    let output = value;
    for (const item of [...stringPatterns, ...pathPatterns]) {
      item.pattern.lastIndex = 0;
      if (!item.pattern.test(output)) continue;
      item.pattern.lastIndex = 0;
      output = output.replace(item.pattern, "[REDACTED]");
      redactedCount += 1;
      appliedPatterns.add(item.name);
    }
    return output;
  };

  const visit = (value: JsonValue, key?: string): JsonValue => {
    if (key !== undefined && secretKeyPattern.test(key)) {
      redactedCount += 1;
      appliedPatterns.add("secret-key-name");
      return "[REDACTED]";
    }
    if (typeof value === "string") return redactString(value);
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value !== null && typeof value === "object") {
      const output: JsonObject = {};
      for (const [childKey, childValue] of Object.entries(value)) output[childKey] = visit(childValue, childKey);
      return output;
    }
    return value;
  };

  return {
    value: visit(input) as T,
    redactedCount,
    appliedPatterns: [...appliedPatterns].sort()
  };
}

export function jsonValue(input: unknown): JsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") return Number.isFinite(input) ? input : String(input);
  if (Array.isArray(input)) return input.map((item) => jsonValue(item));
  if (typeof input === "object") {
    const output: JsonObject = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) output[key] = jsonValue(value);
    }
    return output;
  }
  return String(input);
}
