import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { assertValidRunCase, recordDeepSeekRun, toRunCase, type JsonValue } from "../src/index.js";

const fakeRuntime = resolve("test/fixtures/fake-dsh.mjs");

test("records a keyless SDK run, redacts secrets, and keeps correctness unknown", async () => {
  const root = mkdtempSync(join(tmpdir(), "dsh-runcase-success-"));
  const workspace = join(root, "workspace");
  const dshHome = join(root, "dsh-home");
  mkdirSync(workspace);
  mkdirSync(dshHome);
  const secret = "Bearer test_token_abcdefghijklmnop";
  try {
    const recorded = await recordDeepSeekRun({
      prompt: `Inspect the parser with ${secret}`,
      workspace,
      dshHome,
      dshBin: fakeRuntime,
      environment: { ...process.env, FAKE_TEXT: `recorded response ${secret}` },
      excludedPaths: [root],
      requestTimeoutMs: 5_000
    });
    assert.equal(recorded.capture.status, "succeeded");
    assert.equal(recorded.runCase.run_id, recorded.capture.run_id);
    assert.equal(toRunCase(recorded.capture).run_id, recorded.capture.run_id);
    assert.equal(recorded.runCase.schema_version, "agent.run.v1");
    assert.equal((recorded.runCase.outcome as { status: string }).status, "unknown");
    assert.ok(recorded.capture.notifications.length >= 5);
    const serialized = JSON.stringify(recorded);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(root.replaceAll("\\", "\\\\")), false);
    assert.match(serialized, /REDACTED/);
    assertValidRunCase(recorded.runCase);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retains partial notifications and labels a runtime exit as an agent crash", async () => {
  const root = mkdtempSync(join(tmpdir(), "dsh-runcase-crash-"));
  const workspace = join(root, "workspace");
  const dshHome = join(root, "dsh-home");
  mkdirSync(workspace);
  mkdirSync(dshHome);
  try {
    const recorded = await recordDeepSeekRun({
      prompt: "Exercise the crash boundary.",
      workspace,
      dshHome,
      dshBin: fakeRuntime,
      environment: { ...process.env, FAKE_DSH_MODE: "crash" },
      requestTimeoutMs: 5_000
    });
    assert.equal(recorded.capture.status, "agent_crash");
    assert.ok(recorded.capture.notifications.some((item) => item.method === "session.event"));
    assert.equal((recorded.runCase.outcome as { status: string }).status, "unknown");
    assertValidRunCase(recorded.runCase);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI writes both records and refuses to overwrite them", () => {
  const root = mkdtempSync(join(tmpdir(), "dsh-runcase-cli-"));
  const workspace = join(root, "workspace");
  const dshHome = join(root, "dsh-home");
  const output = join(root, "records", "run.json");
  mkdirSync(workspace);
  mkdirSync(dshHome);
  const args = [
    resolve("dist/src/cli.js"),
    "run",
    "--prompt",
    "Record this keyless CLI contract.",
    "--workspace",
    workspace,
    "--dsh-home",
    dshHome,
    "--dsh-bin",
    fakeRuntime,
    "--output",
    output
  ];
  try {
    const first = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: { ...process.env, FAKE_TEXT: "CLI contract complete" }
    });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(existsSync(output), true);
    assert.equal(existsSync(join(root, "records", "run.capture.json")), true);
    assertValidRunCase(JSON.parse(readFileSync(output, "utf8")) as JsonValue);
    const second = spawnSync(process.execPath, args, { encoding: "utf8", env: process.env });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /Refusing to overwrite/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
