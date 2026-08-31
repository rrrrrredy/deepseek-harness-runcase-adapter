#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, parse, resolve } from "node:path";
import { parseArgs } from "node:util";

import { assertValidRunCase, toRunCase } from "./convert.js";
import { adapterVersion, recordDeepSeekRun } from "./run.js";
import type { DeepSeekHarnessCapture, JsonValue } from "./types.js";

function help(): void {
  process.stdout.write(`DeepSeek Harness RunCase Adapter ${adapterVersion}\n\n`);
  process.stdout.write("Run and record:\n  dsh-runcase run --prompt-file task.txt --workspace . --dsh-home .dsh --output run.json\n\n");
  process.stdout.write("Convert a retained capture:\n  dsh-runcase convert --capture run.capture.json --output run.json\n\n");
  process.stdout.write("Validate a RunCase record:\n  dsh-runcase validate run.json\n");
}

function json(path: string): JsonValue {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as JsonValue;
}

function atomicJson(path: string, value: JsonValue): void {
  const destination = resolve(path);
  if (existsSync(destination)) throw new Error(`Refusing to overwrite an existing record: ${destination}`);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  renameSync(temporary, destination);
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const candidate = Number.parseInt(value, 10);
  if (!Number.isInteger(candidate) || candidate <= 0) throw new Error(`${name} must be a positive integer.`);
  return candidate;
}

async function runCommand(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      prompt: { type: "string" },
      "prompt-file": { type: "string" },
      workspace: { type: "string", default: process.cwd() },
      "dsh-home": { type: "string" },
      output: { type: "string" },
      "capture-output": { type: "string" },
      profile: { type: "string", default: "sdk" },
      provider: { type: "string", default: "deepseek-official" },
      model: { type: "string", default: "deepseek-v4-flash" },
      session: { type: "string" },
      patch: { type: "string", multiple: true },
      "dsh-bin": { type: "string" },
      "reasoning-effort": { type: "string" },
      "max-tokens": { type: "string" },
      "initialize-timeout-ms": { type: "string" },
      "request-timeout-ms": { type: "string" },
      "exclude-path": { type: "string", multiple: true }
    }
  });
  if ((values.prompt === undefined) === (values["prompt-file"] === undefined)) {
    throw new Error("Pass exactly one of --prompt or --prompt-file.");
  }
  const prompt = values.prompt ?? readFileSync(resolve(required(values["prompt-file"], "--prompt-file")), "utf8");
  const output = required(values.output, "--output");
  const dshHome = required(values["dsh-home"] ?? process.env.DSH_HOME, "--dsh-home (or DSH_HOME)");
  const maxTokens = positiveInteger(values["max-tokens"], "--max-tokens");
  const initializeTimeoutMs = positiveInteger(values["initialize-timeout-ms"], "--initialize-timeout-ms");
  const requestTimeoutMs = positiveInteger(values["request-timeout-ms"], "--request-timeout-ms");
  const parsed = parse(resolve(output));
  const captureOutput = values["capture-output"] ?? resolve(parsed.dir, `${parsed.name}.capture.json`);
  if (existsSync(resolve(output)) || existsSync(resolve(captureOutput))) {
    throw new Error("Refusing to overwrite an existing run or capture record.");
  }
  const recorded = await recordDeepSeekRun({
    prompt,
    workspace: required(values.workspace, "--workspace"),
    dshHome,
    profile: required(values.profile, "--profile"),
    provider: required(values.provider, "--provider"),
    model: required(values.model, "--model"),
    ...(values.session === undefined ? {} : { sessionId: values.session }),
    patches: values.patch ?? [],
    ...(values["dsh-bin"] === undefined ? {} : { dshBin: values["dsh-bin"] }),
    ...(values["reasoning-effort"] === undefined ? {} : { reasoningEffort: values["reasoning-effort"] }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(initializeTimeoutMs === undefined ? {} : { initializeTimeoutMs }),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    excludedPaths: values["exclude-path"] ?? [],
    environment: process.env
  });
  atomicJson(captureOutput, recorded.capture as unknown as JsonValue);
  atomicJson(output, recorded.runCase);
  process.stdout.write(`Recorded ${recorded.capture.status}: ${resolve(output)}\nCapture: ${resolve(captureOutput)}\n`);
}

function convertCommand(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: { capture: { type: "string" }, output: { type: "string" } }
  });
  const capture = json(required(values.capture, "--capture")) as unknown as DeepSeekHarnessCapture;
  atomicJson(required(values.output, "--output"), toRunCase(capture));
}

function validateCommand(argv: string[]): void {
  if (argv.length !== 1) throw new Error("validate requires exactly one JSON file.");
  const path = argv[0] as string;
  assertValidRunCase(json(path));
  process.stdout.write(`valid agent.run.v1: ${resolve(path)}\n`);
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    help();
    return;
  }
  if (command === "--version" || command === "version") {
    process.stdout.write(`${adapterVersion}\n`);
    return;
  }
  if (command === "run") return runCommand(argv);
  if (command === "convert") {
    convertCommand(argv);
    return;
  }
  if (command === "validate") {
    validateCommand(argv);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
