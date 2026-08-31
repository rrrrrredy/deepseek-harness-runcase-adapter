# DeepSeek Harness RunCase Adapter

[![CI](https://github.com/rrrrrredy/deepseek-harness-runcase-adapter/actions/workflows/ci.yml/badge.svg)](https://github.com/rrrrrredy/deepseek-harness-runcase-adapter/actions/workflows/ci.yml)

Record one DeepSeek Harness SDK run as a validated, portable `agent.run.v1` JSON file. The record keeps the prompt, configured model, retained Harness events, runtime outcome, redaction status, and known observation gaps together.

This is an independent community adapter. It is not an official DeepSeek product, and it does not claim that a completed run solved the task. Without an external verifier, `outcome.status` stays `unknown`.

## What this adds

- Starts the official pinned DeepSeek Harness SDK runtime and records its notification stream.
- Redacts common API keys, bearer tokens, credentials, and user-selected paths before writing.
- Retains partial events when the Harness runtime crashes or times out.
- Produces a RunCase Interchange v0.1.2 record that can be validated offline or imported into Runtime Evolution Workbench's local Protocol library.
- Runs keyless contract tests on GitHub-hosted Windows x64, Ubuntu x64, and Apple Silicon macOS.

It does not add the Codex-specific Evolution Lab, change DeepSeek Harness configuration, reveal hidden reasoning, verify task correctness, or report remote subagent completion that the SDK does not expose.

## Requirements

- Node.js 22.19 or newer in the Node 22 line, or Node 23/24.
- DeepSeek Harness credentials and profile configuration in a directory you choose as `DSH_HOME`.
- A workspace that the Harness is allowed to use.

The upstream SDK currently installs its same-version full Harness runtime, so the dependency download is much larger than this adapter.

## Install from a release

Download `deepseek-harness-runcase-adapter-0.1.0.tgz` and its checksum from the GitHub Release, verify the checksum, then install the local file:

```bash
npm install --global ./deepseek-harness-runcase-adapter-0.1.0.tgz
```

The package does not register a background service, plugin, startup item, or account connection.

## Record a run

Keep credentials in the environment or your Harness home; do not put API keys on the command line.

```bash
dsh-runcase run \
  --prompt-file task.txt \
  --workspace ./my-repository \
  --dsh-home ./private-dsh-home \
  --output ./records/parser-run.json
```

The command writes two new files and refuses to overwrite either:

- `parser-run.capture.json`: adapter-level DeepSeek capture;
- `parser-run.json`: validated portable `agent.run.v1` record.

Useful options include `--provider`, `--model`, `--profile`, repeated `--patch`, `--reasoning-effort`, `--max-tokens`, and repeated `--exclude-path`.

Records use `.` and `_runtime/deepseek-harness` for the workspace and Harness home by default, so moving or sharing JSON does not reveal host directory names. `--retain-host-paths` is an explicit local-only opt-in and prints a warning because it writes both absolute paths into the capture and RunCase files.

## Validate or reconvert

```bash
dsh-runcase validate ./records/parser-run.json
dsh-runcase convert --capture ./records/parser-run.capture.json --output ./records/rebuilt-run.json
```

To retain it in Runtime Evolution Workbench, open **Runs → Protocol library → Import JSON**. Importing stores a separately validated and redacted copy; it does not turn a DeepSeek record into a native Codex Evolution Lab experiment.

## Platform evidence

Version 0.1.0 is exercised in GitHub-hosted CI on Windows x64, Ubuntu x64, and Apple Silicon macOS. Those jobs run the real published SDK client against a keyless JSON-RPC stand-in, covering launch, notifications, redaction, crash retention, conversion, validation, and package contents. They do not use a production DeepSeek account, a physical Mac, or prove model quality.

See [mapping details](docs/mapping.md), [known limitations](docs/known-limitations.md), [security](SECURITY.md), and [upstream compatibility](UPSTREAM.md).

## Development

```bash
npm ci
npm check
npm pack --dry-run
```

Apache-2.0. See [NOTICE](NOTICE) for attribution and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.
