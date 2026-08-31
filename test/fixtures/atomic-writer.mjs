import { existsSync } from "node:fs";

import { atomicJson, atomicRunRecords } from "../../dist/src/cli.js";

const [output, barrier, label, captureOutput] = process.argv.slice(2);
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
const deadline = Date.now() + 5_000;
while (!existsSync(barrier)) {
  if (Date.now() >= deadline) throw new Error("atomic writer barrier timed out");
  Atomics.wait(waitBuffer, 0, 0, 10);
}
try {
  if (captureOutput) {
    atomicRunRecords(output, captureOutput, { label }, { label, kind: "capture" });
  } else {
    atomicJson(output, { label });
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
